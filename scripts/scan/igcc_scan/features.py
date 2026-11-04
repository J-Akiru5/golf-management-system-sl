"""Find the card by matching the photo against a stored card template.

Contour detection cannot find this card reliably. On the 111 available raw
photos, the largest-contour pick was misaligned on all 97 that it detected, and
the printed table has 13 rows and more than 20 columns, so a single wrong
quadrilateral puts every cell box in the wrong place.

The card itself is a fixed, printed object. Matching the photo's local features
against one reference photo of the same card, then fitting a homography with
RANSAC, localises the four corners to a few pixels and is robust to rotation,
perspective, shadows and competing rectangles: on the same 111 photos it matched
111, with a median corner error of 9.3 px against independently matched corners.

The template is stored as keypoints and descriptors, not as an image, so no
photograph of a filled card is committed. Regenerate it with
`scripts/scan/build_card_template.py` from a rectified card photo. This matcher
only proposes a quadrilateral; `detect.detect_card` still validates it against the
printed table before anything is accepted.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import cv2
import numpy as np

DEFAULT_TEMPLATE_PATH = Path(__file__).resolve().parent.parent / "models" / "igcc-card-template.npz"
TEMPLATE_ENV = "SCAN_CARD_TEMPLATE"

MIN_REFERENCE_KEYPOINTS = 60
MIN_PHOTO_KEYPOINTS = 30
MIN_GOOD_MATCHES = 15
MIN_ACCEPTABLE_INLIERS = 30
RATIO_TEST = 0.72
RANSAC_REPROJECTION = 3.0
MAX_FEATURES = 3000


class CardTemplateError(ValueError):
    """The stored card template is missing or unreadable."""


@dataclass(frozen=True)
class TemplateMatch:
    """A card quadrilateral in the coordinates of the image that was passed in."""

    quad: np.ndarray
    inliers: int
    good_matches: int
    photo_keypoints: int

    @property
    def strong(self) -> bool:
        return self.inliers >= MIN_ACCEPTABLE_INLIERS


class CardTemplateMatcher:
    def __init__(
        self,
        keypoints: np.ndarray,
        descriptors: np.ndarray,
        reference_size: tuple[float, float],
    ) -> None:
        keypoints = np.asarray(keypoints, dtype=np.float32).reshape(-1, 2)
        descriptors = np.asarray(descriptors, dtype=np.float32)
        if keypoints.shape[0] < MIN_REFERENCE_KEYPOINTS:
            raise CardTemplateError(
                f"The card template has only {keypoints.shape[0]} keypoints; "
                f"at least {MIN_REFERENCE_KEYPOINTS} are needed."
            )
        if descriptors.shape[0] != keypoints.shape[0]:
            raise CardTemplateError("The card template keypoints and descriptors disagree.")
        width, height = (float(value) for value in reference_size)
        if width < 100 or height < 100:
            raise CardTemplateError("The card template reference size is implausible.")
        self.keypoints = keypoints
        self.descriptors = descriptors
        self.reference_size = (width, height)
        self.detector = cv2.SIFT_create(nfeatures=MAX_FEATURES)
        self.matcher = cv2.FlannBasedMatcher(dict(algorithm=1, trees=5), dict(checks=64))

    @classmethod
    def from_image(cls, image: np.ndarray) -> CardTemplateMatcher:
        """Build a matcher from a rectified card photo."""
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
        detector = cv2.SIFT_create(nfeatures=MAX_FEATURES)
        keypoints, descriptors = detector.detectAndCompute(gray, None)
        if descriptors is None or len(keypoints) < MIN_REFERENCE_KEYPOINTS:
            raise CardTemplateError("That reference image has too few features to match.")
        height, width = gray.shape[:2]
        return cls(
            np.asarray([point.pt for point in keypoints], dtype=np.float32),
            descriptors,
            (float(width - 1), float(height - 1)),
        )

    @classmethod
    def load(cls, path: Path) -> CardTemplateMatcher:
        try:
            data = np.load(path)
            return cls(data["keypoints"], data["descriptors"], tuple(data["reference_size"]))
        except (OSError, ValueError, KeyError) as exc:
            raise CardTemplateError(f"Could not read the card template at {path}.") from exc

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(
            path,
            keypoints=self.keypoints,
            descriptors=self.descriptors,
            reference_size=np.asarray(self.reference_size, dtype=np.float32),
        )

    def match(self, image: np.ndarray) -> TemplateMatch | None:
        """Card corners in `image` coordinates, or None when evidence is too weak."""
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
        keypoints, descriptors = self.detector.detectAndCompute(gray, None)
        if descriptors is None or len(keypoints) < MIN_PHOTO_KEYPOINTS:
            return None
        pairs = self.matcher.knnMatch(self.descriptors, descriptors.astype(np.float32), k=2)
        good = [
            match
            for pair in pairs
            if len(pair) == 2
            for match, alternative in (pair,)
            if match.distance < RATIO_TEST * alternative.distance
        ]
        if len(good) < MIN_GOOD_MATCHES:
            return None
        source = np.float32([self.keypoints[match.queryIdx] for match in good]).reshape(-1, 1, 2)
        destination = np.float32([keypoints[match.trainIdx].pt for match in good]).reshape(-1, 1, 2)
        homography, mask = cv2.findHomography(
            source,
            destination,
            cv2.RANSAC,
            RANSAC_REPROJECTION,
            maxIters=4000,
            confidence=0.999,
        )
        if homography is None or mask is None:
            return None
        width, height = self.reference_size
        reference_corners = np.float32(
            [[0.0, 0.0], [width, 0.0], [width, height], [0.0, height]]
        ).reshape(-1, 1, 2)
        quad = cv2.perspectiveTransform(reference_corners, homography).reshape(4, 2)
        return TemplateMatch(
            quad=quad,
            inliers=int(mask.sum()),
            good_matches=len(good),
            photo_keypoints=len(keypoints),
        )


@lru_cache(maxsize=2)
def load_default_matcher() -> CardTemplateMatcher | None:
    """The configured template, or None when this deployment has none."""
    raw = (os.environ.get(TEMPLATE_ENV) or "").strip()
    path = Path(raw).expanduser() if raw else DEFAULT_TEMPLATE_PATH
    if not path.exists():
        return None
    try:
        return CardTemplateMatcher.load(path)
    except CardTemplateError:
        return None
