"""Locate the scorecard in a phone photo, refine it, and grade the result.

The previous detector picked the largest contour that happened to approximate a
1.8 quad and never checked whether the resulting warp actually lined up with the
printed table. On the 111 available raw photos that left 14 photos undetected and
97 of 97 comparable warps misaligned: the chosen quadrilateral was a plausible
rectangle, not the card.

This module builds the opposite way round. It proposes every plausible
quadrilateral (from several edge maps, and from the printed table as well as the
card outline), refines each proposal against the smooth alignment score in
`align.py`, and ranks them. A wrong rectangle has to beat the right one on
evidence. A detection that cannot be aligned is reported as a rejection with a
reason instead of being warped and handed to the classifier.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np

from .align import COARSE_SIGMA, AlignmentScorer
from .features import CardTemplateMatcher
from .geometry import CardTemplate
from .quads import corner_angles, edge_support, is_convex, order_quad, quad_area, quad_aspect

# Detector input is capped for speed. The corners are located on this copy and
# scaled back to the original photo before the full-resolution warp.
MAX_WORK_SIDE = 1300
MIN_AREA_FRACTION = 0.04
CARD_ASPECT_RANGE = (1.25, 2.45)
TABLE_ASPECT_RANGE = (2.30, 4.20)
MIN_CORNER_ANGLE = 55.0
MAX_CORNER_ANGLE = 125.0

# Thresholds on `AlignmentScorer.score`, measured on the available raw photo set:
# the reference warps score 0.41-0.53, a warp onto the wrong rectangle scores
# between -0.06 and 0.13.
HIGH_ALIGNMENT = 0.36
MEDIUM_ALIGNMENT = 0.24
LOW_ALIGNMENT = 0.16
HIGH_MARGIN = 0.04

REFINE_STEPS = (24, 12, 6, 3, 1)
MAX_REFINED_CANDIDATES = 6


@dataclass(frozen=True)
class ImageQuality:
    sharpness: float
    glare_fraction: float
    brightness: float
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True)
class QuadGeometry:
    aspect: float
    area_fraction: float
    min_angle: float
    max_angle: float
    edge_support: float
    convex: bool

    @property
    def plausible(self) -> bool:
        return (
            self.convex
            and CARD_ASPECT_RANGE[0] <= self.aspect <= CARD_ASPECT_RANGE[1]
            and self.area_fraction >= MIN_AREA_FRACTION
            and MIN_CORNER_ANGLE <= self.min_angle
            and self.max_angle <= MAX_CORNER_ANGLE
        )


@dataclass(frozen=True)
class CardDetection:
    quad: np.ndarray
    source: str
    alignment: float
    runner_up_alignment: float
    margin: float
    refined: bool
    geometry: QuadGeometry
    quality: ImageQuality
    confidence: str
    decision: str
    reasons: tuple[str, ...] = field(default_factory=tuple)
    candidate_count: int = 0
    inliers: int = 0

    @property
    def corners(self) -> tuple[tuple[float, float], ...]:
        return tuple((float(x), float(y)) for x, y in self.quad.tolist())

    @property
    def accepted(self) -> bool:
        return self.decision in {"accept", "confirm"}


def _work_image(image: np.ndarray, max_side: int = MAX_WORK_SIDE) -> tuple[np.ndarray, float]:
    height, width = image.shape[:2]
    scale = min(1.0, max_side / float(max(height, width)))
    if scale >= 1.0:
        return image, 1.0
    work = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    return work, scale


def _edge_masks(gray: np.ndarray) -> list[np.ndarray]:
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    masks: list[np.ndarray] = []
    kernel = np.ones((3, 3), np.uint8)
    for low, high in ((30, 100), (50, 150), (75, 200)):
        masks.append(cv2.dilate(cv2.Canny(blur, low, high), kernel, iterations=1))
    adaptive = cv2.adaptiveThreshold(
        blur,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        51,
        12,
    )
    masks.append(cv2.morphologyEx(adaptive, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8)))
    return masks


def card_quad_from_table(table_quad: np.ndarray, template: CardTemplate) -> np.ndarray:
    """Map a printed-table quadrilateral back onto the card outline."""
    table = template.table
    destination = np.array(
        [[table.x0, table.y0], [table.x1, table.y0], [table.x1, table.y1], [table.x0, table.y1]],
        dtype=np.float32,
    )
    source = order_quad(table_quad)
    # Template coordinates -> photo coordinates, so the template's card rectangle
    # can be projected back onto the photo.
    matrix = cv2.getPerspectiveTransform(destination, source)
    card_rect = np.array(
        [
            [0.0, 0.0],
            [template.width - 1.0, 0.0],
            [template.width - 1.0, template.height - 1.0],
            [0.0, template.height - 1.0],
        ],
        dtype=np.float32,
    ).reshape(-1, 1, 2)
    return cv2.perspectiveTransform(card_rect, matrix).reshape(4, 2)


def _dedupe(quads: list[np.ndarray], tolerance: float) -> list[np.ndarray]:
    kept: list[np.ndarray] = []
    for quad in quads:
        if any(
            float(np.max(np.linalg.norm(quad - other, axis=1))) < tolerance for other in kept
        ):
            continue
        kept.append(quad)
    return kept


def proposal_quads(
    work: np.ndarray, template: CardTemplate
) -> list[tuple[str, np.ndarray]]:
    """Every plausible card-shaped or table-shaped quadrilateral, unranked."""
    gray = cv2.cvtColor(work, cv2.COLOR_BGR2GRAY)
    height, width = gray.shape[:2]
    frame_area = float(height * width)
    tolerance = 0.015 * float(np.hypot(height, width))
    proposals: list[tuple[str, np.ndarray]] = []
    cards: list[np.ndarray] = []
    tables: list[np.ndarray] = []
    for mask in _edge_masks(gray):
        contours, _ = cv2.findContours(mask, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        for contour in sorted(contours, key=cv2.contourArea, reverse=True)[:50]:
            area = cv2.contourArea(contour)
            if area < MIN_AREA_FRACTION * frame_area:
                continue
            perimeter = cv2.arcLength(contour, True)
            if perimeter <= 0:
                continue
            for epsilon in (0.015, 0.03, 0.05):
                approx = cv2.approxPolyDP(contour, epsilon * perimeter, True)
                if len(approx) != 4 or not cv2.isContourConvex(approx):
                    continue
                try:
                    quad = order_quad(approx.astype(np.float32))
                except ValueError:
                    continue
                aspect = quad_aspect(quad)
                if CARD_ASPECT_RANGE[0] <= aspect <= CARD_ASPECT_RANGE[1]:
                    cards.append(quad)
                elif TABLE_ASPECT_RANGE[0] <= aspect <= TABLE_ASPECT_RANGE[1]:
                    tables.append(quad)
    for quad in _dedupe(cards, tolerance):
        proposals.append(("card_contour", quad))
    for quad in _dedupe(tables, tolerance):
        proposals.append(("table_contour", card_quad_from_table(quad, template)))
    return proposals


def refine_quad(
    image: np.ndarray,
    quad: np.ndarray,
    scorer: AlignmentScorer,
    steps: tuple[int, ...] = REFINE_STEPS,
    coarse: AlignmentScorer | None = None,
    coarse_above: int = 12,
) -> tuple[np.ndarray, float]:
    """Move the four corners, one coordinate at a time, to maximise alignment.

    Large steps are judged with the wide-basin scorer so a proposal that is far
    out can still be pulled in; the small steps use the fine scorer that decides
    the final placement.
    """
    best = np.asarray(quad, dtype=np.float32).copy()
    best_score = scorer.score_quad(image, best)
    for step in steps:
        active = coarse if (coarse is not None and step >= coarse_above) else scorer
        sweeps = 0
        improved = True
        while improved and sweeps < 8:
            improved = False
            sweeps += 1
            for index in range(4):
                for axis in range(2):
                    for delta in (step, -step):
                        trial = best.copy()
                        trial[index, axis] += float(delta)
                        score = active.score_quad(image, trial)
                        if score > best_score + 1e-4:
                            best, best_score = trial, score
                            improved = True
    return best, scorer.score_quad(image, best)


def image_quality(image: np.ndarray) -> ImageQuality:
    """Sharpness, glare and brightness, used for warnings rather than rejection."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
    scale = min(1.0, 1000.0 / float(max(gray.shape)))
    small = (
        cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        if scale < 1.0
        else gray
    )
    sharpness = float(cv2.Laplacian(small, cv2.CV_64F).var())
    # White card stock sits around 240-250, so only near-saturated pixels count
    # as glare; otherwise every clean card would be flagged in every photo.
    glare = float((small >= 252).mean())
    brightness = float(small.mean())
    warnings: list[str] = []
    if sharpness < 45.0:
        warnings.append("The photo is soft; small digits may be hard to read.")
    if glare > 0.06:
        warnings.append("Part of the photo is blown out by glare.")
    if brightness < 55.0:
        warnings.append("The photo is very dark.")
    return ImageQuality(
        sharpness=round(sharpness, 1),
        glare_fraction=round(glare, 4),
        brightness=round(brightness, 1),
        warnings=tuple(warnings),
    )


def _geometry(work: np.ndarray, quad: np.ndarray) -> QuadGeometry:
    gray = cv2.cvtColor(work, cv2.COLOR_BGR2GRAY)
    edges = cv2.dilate(
        cv2.Canny(cv2.GaussianBlur(gray, (5, 5), 0), 50, 150), np.ones((3, 3), np.uint8)
    )
    angles = corner_angles(quad)
    area_fraction = quad_area(quad) / float(work.shape[0] * work.shape[1])
    return QuadGeometry(
        aspect=round(quad_aspect(quad), 3),
        area_fraction=round(area_fraction, 4),
        min_angle=round(min(angles), 1),
        max_angle=round(max(angles), 1),
        edge_support=round(edge_support(edges, quad), 3),
        convex=is_convex(quad),
    )


def _grade(
    alignment: float, margin: float, geometry: QuadGeometry, quality: ImageQuality
) -> tuple[str, str, tuple[str, ...]]:
    reasons: list[str] = []
    if not geometry.convex:
        reasons.append("The detected outline is not convex.")
    elif geometry.min_angle < MIN_CORNER_ANGLE or geometry.max_angle > MAX_CORNER_ANGLE:
        reasons.append(
            f"Corners are distorted ({geometry.min_angle:.0f} to {geometry.max_angle:.0f} degrees)."
        )
    if not CARD_ASPECT_RANGE[0] <= geometry.aspect <= CARD_ASPECT_RANGE[1]:
        reasons.append(f"The detected shape is {geometry.aspect:.2f}:1, not card shaped.")
    if geometry.area_fraction < MIN_AREA_FRACTION:
        reasons.append("The detected card covers too little of the photo.")
    reasons.extend(quality.warnings)

    if not geometry.convex or geometry.area_fraction < MIN_AREA_FRACTION / 2.0:
        return "low", "reject", tuple(reasons)
    if alignment < LOW_ALIGNMENT:
        reasons.append(
            "The rectified card does not line up with the printed table; "
            "the outline is probably not the card."
        )
        return "low", "reject", tuple(reasons)
    if alignment < MEDIUM_ALIGNMENT:
        return "low", "retake", tuple(reasons)
    if alignment < HIGH_ALIGNMENT or margin < HIGH_MARGIN or reasons:
        return "medium", "confirm", tuple(reasons)
    return "high", "accept", tuple(reasons)


def detect_card(
    image: np.ndarray,
    template: CardTemplate,
    *,
    refine: bool = False,
    max_candidates: int = MAX_REFINED_CANDIDATES,
    scorer: AlignmentScorer | None = None,
    matcher: CardTemplateMatcher | None = None,
) -> CardDetection | None:
    """Best card quadrilateral in the photo, or None when nothing is proposed.

    A stored card template is tried first because it finds the corners directly.
    The contour path is the fallback for a deployment that has no template, and
    it is still ranked and gated by the same alignment score.

    Corner refinement is off by default: on the synthetic reference photo it moved
    a 4.8 px accurate contour quad to 6.2 px, and on real photos it never lifted a
    wrong quad above the gate. It is kept for experiments, not for the default path.
    """
    work, scale = _work_image(image)
    scorer = scorer or AlignmentScorer(template, scale=0.5)
    quality = image_quality(work)

    if matcher is not None:
        match = matcher.match(work)
        if match is not None and match.strong:
            alignment = scorer.score_quad(work, match.quad)
            geometry = _geometry(work, match.quad)
            confidence, decision, reasons = _grade(alignment, alignment, geometry, quality)
            return CardDetection(
                quad=match.quad / scale,
                source="template_features",
                alignment=round(alignment, 4),
                runner_up_alignment=0.0,
                margin=round(alignment, 4),
                refined=False,
                geometry=geometry,
                quality=quality,
                confidence=confidence,
                decision=decision,
                reasons=reasons,
                candidate_count=1,
                inliers=match.inliers,
            )

    coarse = AlignmentScorer(template, scale=0.5, sigma=COARSE_SIGMA)
    proposals = proposal_quads(work, template)
    if not proposals:
        return None

    initial = [(scorer.score_quad(work, quad), source, quad) for source, quad in proposals]
    initial.sort(key=lambda item: -item[0])

    scored: list[tuple[float, str, np.ndarray, bool]] = []
    refined_any = False
    for score, source, quad in initial[:max_candidates]:
        if refine:
            quad, score = refine_quad(work, quad, scorer, coarse=coarse)
            refined_any = True
        scored.append((score, source, quad, refine))
    for score, source, quad in initial[max_candidates:]:
        scored.append((score, source, quad, False))
    scored.sort(key=lambda item: -item[0])

    best_score, source, quad, was_refined = scored[0]
    runner_up = scored[1][0] if len(scored) > 1 else 0.0
    geometry = _geometry(work, quad)
    confidence, decision, reasons = _grade(best_score, best_score - runner_up, geometry, quality)

    original_quad = quad / scale
    return CardDetection(
        quad=original_quad,
        source=source,
        alignment=round(best_score, 4),
        runner_up_alignment=round(runner_up, 4),
        margin=round(best_score - runner_up, 4),
        refined=was_refined and refined_any,
        geometry=geometry,
        quality=quality,
        confidence=confidence,
        decision=decision,
        reasons=reasons,
        candidate_count=len(proposals),
    )
