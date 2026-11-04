"""Decode, detect and perspective-correct a scorecard photo.

Detection is deliberately conservative. The only filled card available has a busy
background and a hand on the corner; the contour finder can see the printed table
(aspect ratio about 2.46) but not the whole card. A wrong quadrilateral would put
every score cell in the wrong place, so the service returns a clear
`card_not_detected` error instead of guessing. For a fixed camera or a pre-cropped
photo, set `SCAN_CARD_CORNERS` or `SCAN_CARD_MODE=prewarped`.
"""

from __future__ import annotations

import io
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

from .geometry import CardTemplate

MAX_IMAGE_PIXELS = 60_000_000


class ImageDecodeError(ValueError):
    """The uploaded bytes are not a usable image."""


class CardNotFoundError(ValueError):
    """The card outline could not be found; no cells were guessed."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.reason = "card_not_detected"


@dataclass
class RectifiedCard:
    image: np.ndarray
    auto_detected: bool
    corners: tuple[tuple[float, float], ...] | None
    orientation_degrees: int
    orientation_score: float
    orientation_confident: bool
    table_levelled: bool
    table_quad: tuple[tuple[float, float], ...] | None
    warnings: list[str] = field(default_factory=list)
    detected_by: str = "none"


def decode_image(data: bytes) -> np.ndarray:
    """Bytes -> EXIF-upright BGR image."""
    if not data:
        raise ImageDecodeError("The image is empty.")
    try:
        Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS
        with Image.open(io.BytesIO(data)) as opened:
            opened.load()
            if opened.width * opened.height > MAX_IMAGE_PIXELS:
                raise ImageDecodeError("The image is too large to scan.")
            upright = ImageOps.exif_transpose(opened).convert("RGB")
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise ImageDecodeError("The file is not a readable JPEG, PNG or WebP image.") from exc
    rgb = np.asarray(upright)
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)


def rotate_image(image: np.ndarray, degrees: int) -> np.ndarray:
    """Rotate counter-clockwise. Only right angles are supported."""
    if degrees % 360 == 0:
        return image
    if degrees % 360 not in {90, 180, 270}:
        raise ValueError("Rotation must be 0, 90, 180 or 270 degrees.")
    return np.ascontiguousarray(np.rot90(image, k=(degrees % 360) // 90))


def order_quad(points: np.ndarray | list[list[float]]) -> np.ndarray:
    """Order four points as TL, TR, BR, BL."""
    pts = np.asarray(points, dtype=np.float32).reshape(4, 2)
    sums = pts.sum(axis=1)
    diffs = np.diff(pts, axis=1).ravel()
    ordered = np.array(
        [pts[np.argmin(sums)], pts[np.argmin(diffs)], pts[np.argmax(sums)], pts[np.argmax(diffs)]],
        dtype=np.float32,
    )
    if len({tuple(point) for point in ordered.tolist()}) != 4:
        raise ValueError("The four card corners are not distinct.")
    return ordered


def _quad_aspect(points: np.ndarray) -> float:
    top = np.linalg.norm(points[0] - points[1])
    left = np.linalg.norm(points[0] - points[3])
    long_side = max(top, left)
    short_side = min(top, left)
    return float(long_side / short_side) if short_side else 0.0


def _find_quad(gray: np.ndarray) -> np.ndarray | None:
    height, width = gray.shape
    scale = min(1.0, 1600.0 / max(height, width))
    if scale < 1.0:
        work = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    else:
        work = gray
    work_height, work_width = work.shape

    candidates: list[tuple[float, np.ndarray]] = []
    blur = cv2.GaussianBlur(work, (5, 5), 0)
    for low, high in ((30, 100), (50, 150), (70, 200)):
        edges = cv2.Canny(blur, low, high)
        edges = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=1)
        contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        for contour in sorted(contours, key=cv2.contourArea, reverse=True)[:40]:
            area = cv2.contourArea(contour)
            if area < 0.12 * work_width * work_height:
                continue
            perimeter = cv2.arcLength(contour, True)
            if perimeter <= 0:
                continue
            approx = cv2.approxPolyDP(contour, 0.02 * perimeter, True)
            if len(approx) != 4 or not cv2.isContourConvex(approx):
                continue
            quad = order_quad(approx.astype(np.float32))
            aspect = _quad_aspect(quad)
            # The IGCC card is 1800 x 1000 = 1.8. Reject the printed table
            # (about 2.46) and portrait guesses. A different print run needs a
            # template-specific range.
            if not 1.55 <= aspect <= 2.10:
                continue
            quad_area = cv2.contourArea(quad)
            rectangularity = area / quad_area if quad_area else 0.0
            if rectangularity < 0.75:
                continue
            score = (area / (work_width * work_height)) + 0.10 * rectangularity
            candidates.append((score, quad / scale))
    if not candidates:
        return None
    candidates.sort(key=lambda item: item[0], reverse=True)
    return candidates[0][1]


def detect_card_quad(image: np.ndarray) -> tuple[np.ndarray, tuple[float, float]] | None:
    """Best-effort quadrilateral in the original image, and its area fraction."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    quad = _find_quad(gray)
    if quad is None:
        return None
    area = abs(cv2.contourArea(quad))
    return quad, float(area / (image.shape[0] * image.shape[1]))


def _find_table_quad(gray: np.ndarray, template: CardTemplate) -> np.ndarray | None:
    """Find the printed table rectangle when the card outline is hidden.

    The card edge is often covered by a hand or lost against the background, but
    the printed table is a strong, high-contrast rectangle. Its aspect ratio is
    about 3.05 (1618 x 530 on the template), which is distinct from the 1.8 card.
    """
    height, width = gray.shape
    scale = min(1.0, 1600.0 / max(height, width))
    if scale < 1.0:
        work = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    else:
        work = gray
    work_height, work_width = work.shape
    table = template.table
    expected_aspect = (table.x1 - table.x0) / float(table.y1 - table.y0)

    candidates: list[tuple[float, np.ndarray]] = []
    blur = cv2.GaussianBlur(work, (5, 5), 0)
    for low, high in ((30, 100), (50, 150), (70, 200)):
        edges = cv2.Canny(blur, low, high)
        edges = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=1)
        contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        for contour in sorted(contours, key=cv2.contourArea, reverse=True)[:60]:
            area = cv2.contourArea(contour)
            if area < 0.05 * work_width * work_height:
                continue
            perimeter = cv2.arcLength(contour, True)
            if perimeter <= 0:
                continue
            approx = cv2.approxPolyDP(contour, 0.02 * perimeter, True)
            if len(approx) != 4 or not cv2.isContourConvex(approx):
                continue
            quad = order_quad(approx.astype(np.float32))
            aspect = _quad_aspect(quad)
            if not 0.80 * expected_aspect <= aspect <= 1.20 * expected_aspect:
                continue
            quad_area = cv2.contourArea(quad)
            rectangularity = area / quad_area if quad_area else 0.0
            if rectangularity < 0.75:
                continue
            score = (area / (work_width * work_height)) + 0.10 * rectangularity
            candidates.append((score, quad / scale))
    if not candidates:
        return None
    candidates.sort(key=lambda item: item[0], reverse=True)
    return candidates[0][1]


def detect_table_quad(image: np.ndarray, template: CardTemplate) -> tuple[np.ndarray, float] | None:
    """Best-effort table quadrilateral and its area fraction."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    quad = _find_table_quad(gray, template)
    if quad is None:
        return None
    area = abs(cv2.contourArea(quad))
    return quad, float(area / (image.shape[0] * image.shape[1]))


def detect_table_in_rotations(
    image: np.ndarray, template: CardTemplate
) -> tuple[np.ndarray, int, np.ndarray, float] | None:
    """Try the four right-angle rotations and return the best table detection.

    A phone photo can be stored sideways. The table aspect ratio alone cannot
    tell 90 from 270, so the normal orientation scorer runs after the warp.
    """
    best: tuple[float, np.ndarray, int, np.ndarray, float] | None = None
    for degrees in (0, 90, 180, 270):
        rotated = rotate_image(image, degrees)
        found = detect_table_quad(rotated, template)
        if found is None:
            continue
        quad, area_fraction = found
        top = float(np.linalg.norm(quad[0] - quad[1]))
        left = float(np.linalg.norm(quad[0] - quad[3]))
        # The template table is landscape. All four rotations can produce a
        # 3:1 quad, so prefer the one where the table is actually wider than it
        # is tall; otherwise a portrait candidate is warped sideways and the
        # cell boxes no longer fit the card.
        score = area_fraction + (0.01 if top >= left else 0.0)
        if best is None or score > best[0]:
            best = (score, rotated, degrees, quad, area_fraction)
    if best is None:
        return None
    _, rotated, degrees, quad, area_fraction = best
    return rotated, degrees, quad, area_fraction


def warp_table(image: np.ndarray, table_quad: np.ndarray, template: CardTemplate) -> np.ndarray:
    """Map the printed table onto its template rectangle, keeping the card frame."""
    table = template.table
    source = order_quad(table_quad)
    destination = np.array(
        [
            [table.x0, table.y0],
            [table.x1, table.y0],
            [table.x1, table.y1],
            [table.x0, table.y1],
        ],
        dtype=np.float32,
    )
    matrix = cv2.getPerspectiveTransform(source, destination)
    return cv2.warpPerspective(
        image,
        matrix,
        (template.width, template.height),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_REPLICATE,
    )


def warp_card(image: np.ndarray, corners: np.ndarray, template: CardTemplate) -> np.ndarray:
    quad = order_quad(corners)
    destination = np.array(
        [
            [0, 0],
            [template.width - 1, 0],
            [template.width - 1, template.height - 1],
            [0, template.height - 1],
        ],
        dtype=np.float32,
    )
    matrix = cv2.getPerspectiveTransform(quad, destination)
    return cv2.warpPerspective(
        image,
        matrix,
        (template.width, template.height),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_REPLICATE,
    )


def _ink_mask(gray: np.ndarray) -> np.ndarray:
    # Adaptive threshold survives uneven phone-photo lighting; the grid lines
    # and handwriting both count as ink for alignment purposes.
    return cv2.adaptiveThreshold(
        gray,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        51,
        12,
    )


def grid_alignment_score(card: np.ndarray, template: CardTemplate) -> float:
    """How well the printed table lines line up with the template."""
    gray = cv2.cvtColor(card, cv2.COLOR_BGR2GRAY)
    ink = (_ink_mask(gray) > 0).astype(np.float32)
    x_edges, y_edges = template.table_edges()
    x_scores: list[float] = []
    y_scores: list[float] = []
    for x in x_edges:
        if 2 <= x < template.width - 2:
            band = ink[template.table.y0 : template.table.y1, x - 2 : x + 3]
            if band.size:
                x_scores.append(float(band.mean()))
    for y in y_edges:
        if 2 <= y < template.height - 2:
            band = ink[y - 2 : y + 3, template.table.x0 : template.table.x1]
            if band.size:
                y_scores.append(float(band.mean()))
    if not x_scores or not y_scores:
        return 0.0
    return float(np.median(x_scores) + np.median(y_scores))


def choose_orientation(
    card: np.ndarray, template: CardTemplate
) -> tuple[np.ndarray, int, float, bool]:
    """Pick the right-angle rotation whose table lines match the template.

    Only rotations that keep the card in the template frame are considered. A 90
    degree turn makes an 1800 x 1000 card portrait, and the template cell boxes
    (x up to 1733) then fall outside the image; the row scores on a portrait crop
    are noise, so a portrait turn could win on a real photo and every cell box
    was outside the card. Rectification always returns the template frame, so 0
    and 180 are the only meaningful choices.
    """
    best: tuple[np.ndarray, int, float] | None = None
    for degrees in (0, 180):
        rotated = rotate_image(card, degrees)
        if rotated.shape[:2] != (template.height, template.width):
            continue
        score = grid_alignment_score(rotated, template)
        if best is None or score > best[2]:
            best = (rotated, degrees, score)
    if best is None:
        raise CardNotFoundError(
            "The card was not rectified to the 1800 x 1000 template frame, so the "
            "cell boxes do not fit it. No scores were read."
        )
    rotated, degrees, score = best
    # A blank card has no grid evidence. Returning an arbitrary orientation is
    # safe only because every cell is null; flag it for the caller.
    return rotated, degrees, score, score >= 0.08


def _dark_fraction_row(gray: np.ndarray, y: int, x: int, window: int = 18) -> float:
    row = gray[y, max(0, x - window) : min(gray.shape[1], x + window + 1)]
    return float((row < 165).mean())


def _dark_fraction_col(gray: np.ndarray, x: int, y: int, window: int = 18) -> float:
    column = gray[max(0, y - window) : min(gray.shape[0], y + window + 1), x]
    return float((column < 165).mean())


def _fit_border(points: list[tuple[int, int]], horizontal: bool) -> tuple[float, float] | None:
    if len(points) < 20:
        return None
    pts = np.asarray(points, dtype=np.float32)
    for _ in range(5):
        if horizontal:
            slope, intercept = np.polyfit(pts[:, 0], pts[:, 1], 1)
            residual = np.abs(pts[:, 1] - (slope * pts[:, 0] + intercept))
        else:
            slope, intercept = np.polyfit(pts[:, 1], pts[:, 0], 1)
            residual = np.abs(pts[:, 0] - (slope * pts[:, 1] + intercept))
        keep = residual < 2.5
        if keep.sum() < 10:
            return None
        if keep.all():
            break
        pts = pts[keep]
    return float(slope), float(intercept)


def _border_points(
    gray: np.ndarray,
    template: CardTemplate,
    edge: str,
) -> list[tuple[int, int]]:
    points: list[tuple[int, int]] = []
    table = template.table
    if edge == "top":
        for x in range(table.x0 + 10, table.x1 - 10, 3):
            ys = [
                y
                for y in range(max(0, table.y0 - 5), table.y0 + 45)
                if _dark_fraction_row(gray, y, x) > 0.6
            ]
            if ys:
                points.append((x, ys[0]))
    elif edge == "bottom":
        for x in range(table.x0 + 10, table.x1 - 10, 3):
            ys = [
                y
                for y in range(min(gray.shape[0] - 1, table.y1 + 30), table.y1 - 25, -1)
                if _dark_fraction_row(gray, y, x) > 0.6
            ]
            if ys:
                points.append((x, ys[0]))
    elif edge == "left":
        for y in range(table.y0 + 10, table.y1 - 10, 2):
            xs = [
                x
                for x in range(max(0, table.x0 - 25), table.x0 + 25)
                if _dark_fraction_col(gray, x, y) > 0.6
            ]
            if xs:
                points.append((xs[0], y))
    elif edge == "right":
        for y in range(table.y0 + 10, table.y1 - 10, 2):
            xs = [
                x
                for x in range(min(gray.shape[1] - 1, table.x1 + 25), table.x1 - 25, -1)
                if _dark_fraction_col(gray, x, y) > 0.6
            ]
            if xs:
                points.append((xs[0], y))
    else:
        raise ValueError(f"Unknown table edge: {edge}")
    return points


def _intersect(top: tuple[float, float], left: tuple[float, float]) -> tuple[float, float]:
    """Intersect y = m1*x + b1 with x = m2*y + b2."""
    m1, b1 = top
    m2, b2 = left
    y = (m1 * b2 + b1) / (1.0 - m1 * m2)
    x = m2 * y + b2
    return float(x), float(y)


@dataclass
class TableLevel:
    image: np.ndarray
    applied: bool
    quad: tuple[tuple[float, float], ...] | None
    warnings: list[str] = field(default_factory=list)


def level_table(card: np.ndarray, template: CardTemplate) -> TableLevel:
    """Remove residual perspective skew by mapping the printed table to the template.

    The card corners are a rough rectangle; a small corner error leaves the printed
    table sloping by 10-20 px across the card. Fixed cell boxes would then clip the
    right side of a row. The table border is a stronger, more local reference: fit
    its four printed edges, map that quadrilateral onto the template table and warp
    the whole card. If the borders cannot be fitted confidently, the card is left
    unchanged and a warning is returned.
    """
    gray = cv2.cvtColor(card, cv2.COLOR_BGR2GRAY)
    table = template.table
    lines: dict[str, tuple[float, float]] = {}
    for edge, horizontal in (
        ("top", True),
        ("bottom", True),
        ("left", False),
        ("right", False),
    ):
        points = _border_points(gray, template, edge)
        fitted = _fit_border(points, horizontal)
        if fitted is None:
            return TableLevel(
                image=card,
                applied=False,
                quad=None,
                warnings=[f"Table leveling skipped: the {edge} border was not found."],
            )
        lines[edge] = fitted

    top_m, top_b = lines["top"]
    bottom_m, bottom_b = lines["bottom"]
    left_m, left_b = lines["left"]
    right_m, right_b = lines["right"]
    tolerance_x = 30
    tolerance_y = 35
    if not (
        table.y0 - tolerance_y
        <= top_m * table.x0 + top_b
        <= table.y0 + tolerance_y
        and table.y0 - tolerance_y
        <= top_m * table.x1 + top_b
        <= table.y0 + tolerance_y
    ):
        return TableLevel(card, False, None, ["Table leveling skipped: top border is too far out."])
    if not (
        table.y1 - tolerance_y
        <= bottom_m * table.x0 + bottom_b
        <= table.y1 + tolerance_y
        and table.y1 - tolerance_y
        <= bottom_m * table.x1 + bottom_b
        <= table.y1 + tolerance_y
    ):
        return TableLevel(
            card, False, None, ["Table leveling skipped: bottom border is too far out."]
        )
    if not (
        table.x0 - tolerance_x
        <= left_m * table.y0 + left_b
        <= table.x0 + tolerance_x
        and table.x0 - tolerance_x
        <= left_m * table.y1 + left_b
        <= table.x0 + tolerance_x
    ):
        return TableLevel(card, False, None, ["Table leveling skipped: left border is too far out."])
    if not (
        table.x1 - tolerance_x
        <= right_m * table.y0 + right_b
        <= table.x1 + tolerance_x
        and table.x1 - tolerance_x
        <= right_m * table.y1 + right_b
        <= table.x1 + tolerance_x
    ):
        return TableLevel(
            card, False, None, ["Table leveling skipped: right border is too far out."]
        )

    quad = (
        _intersect(lines["top"], lines["left"]),
        _intersect(lines["top"], lines["right"]),
        _intersect(lines["bottom"], lines["right"]),
        _intersect(lines["bottom"], lines["left"]),
    )
    source = np.asarray(quad, dtype=np.float32)
    area = abs(cv2.contourArea(source))
    if area < 0.25 * template.width * template.height:
        return TableLevel(card, False, None, ["Table leveling skipped: table area is implausible."])
    if np.any(source[:, 0] < 0) or np.any(source[:, 0] >= template.width):
        return TableLevel(card, False, None, ["Table leveling skipped: table leaves the card."])
    if np.any(source[:, 1] < 0) or np.any(source[:, 1] >= template.height):
        return TableLevel(card, False, None, ["Table leveling skipped: table leaves the card."])
    destination = np.array(
        [
            [table.x0, table.y0],
            [table.x1, table.y0],
            [table.x1, table.y1],
            [table.x0, table.y1],
        ],
        dtype=np.float32,
    )
    matrix = cv2.getPerspectiveTransform(source, destination)
    levelled = cv2.warpPerspective(
        card,
        matrix,
        (template.width, template.height),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_REPLICATE,
    )
    return TableLevel(
        image=levelled,
        applied=True,
        quad=tuple((float(x), float(y)) for x, y in quad),
    )


def _resize_prewarped(image: np.ndarray, template: CardTemplate) -> np.ndarray:
    if image.shape[1] == template.width and image.shape[0] == template.height:
        return image
    return cv2.resize(image, (template.width, template.height), interpolation=cv2.INTER_AREA)


def rectify_card(
    image: np.ndarray,
    template: CardTemplate,
    *,
    corners: tuple[tuple[float, float], ...] | None = None,
    mode: str = "auto",
    forced_rotation: int | None = None,
    debug_dir: Path | None = None,
) -> RectifiedCard:
    warnings: list[str] = []
    auto_detected = False
    used_corners = corners
    detected_by = "none"
    detected_table_quad: np.ndarray | None = None
    detection_rotation = 0
    if corners is not None:
        card = warp_card(image, np.asarray(corners, dtype=np.float32), template)
        detected_by = "corners"
    elif mode == "prewarped":
        height, width = image.shape[:2]
        if (height > width) != (template.height > template.width):
            raise CardNotFoundError(
                "A prewarped card must already be in the template orientation "
                f"({template.width} x {template.height} landscape), got "
                f"{width} x {height}. No scores were read."
            )
        card = _resize_prewarped(image, template)
        detected_by = "prewarped"
        warnings.append("Card was treated as already rectified (SCAN_CARD_MODE=prewarped).")
    else:
        found = detect_card_quad(image)
        if found is not None:
            quad, area_fraction = found
            auto_detected = True
            detected_by = "card"
            used_corners = tuple((float(x), float(y)) for x, y in quad.tolist())
            card = warp_card(image, quad, template)
            if area_fraction < 0.25:
                warnings.append("The detected card covers less than a quarter of the photo.")
        else:
            table_found = detect_table_in_rotations(image, template)
            if table_found is None:
                raise CardNotFoundError(
                    "Neither the card outline nor the printed table could be found. "
                    "Use a photo with the whole table visible, or configure "
                    "SCAN_CARD_CORNERS / SCAN_CARD_MODE=prewarped. No scores were read."
                )
            rotated, detection_rotation, table_quad, area_fraction = table_found
            auto_detected = True
            detected_by = "table"
            detected_table_quad = table_quad
            card = warp_table(rotated, table_quad, template)
            warnings.append(
                "Card outline was not found; the printed table was used for rectification."
            )
            if area_fraction < 0.15:
                warnings.append("The detected table covers less than 15% of the photo.")
    if used_corners is not None and not auto_detected:
        warnings.append("Card corners came from configuration, not from detection.")

    if forced_rotation is not None:
        card = rotate_image(card, forced_rotation)
        orientation = (detection_rotation + forced_rotation) % 360
        score = 0.0
        confident = True
    else:
        card, orientation, score, confident = choose_orientation(card, template)
        orientation = (detection_rotation + orientation) % 360
        if not confident:
            warnings.append(
                "Card orientation could not be confirmed from the printed table; "
                "every unreadable cell is returned as null."
            )

    if detected_by == "table":
        # The table was mapped onto the template directly. Re-running the border
        # fit can move it again, so keep the explicit warp and its quad.
        table_levelled = True
        table_quad = (
            tuple((float(x), float(y)) for x, y in detected_table_quad.tolist())
            if detected_table_quad is not None
            else None
        )
    else:
        level = level_table(card, template)
        card = level.image
        warnings.extend(level.warnings)
        table_levelled = level.applied
        table_quad = level.quad

    if debug_dir is not None:
        debug_dir.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(debug_dir / "card_rectified.png"), card)

    return RectifiedCard(
        image=card,
        auto_detected=auto_detected,
        corners=used_corners,
        orientation_degrees=orientation,
        orientation_score=round(score, 4),
        orientation_confident=confident,
        table_levelled=table_levelled,
        table_quad=table_quad,
        warnings=warnings,
        detected_by=detected_by,
    )
