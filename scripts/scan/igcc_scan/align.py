"""Score how well a rectified card lines up with the printed template.

The older `grid_alignment_score` sampled a 5 px band around every printed line and
took the median ink density. That measurement saturates as soon as a line is a few
pixels out of place: a card 30 px off and a card 400 px off both score around 0.25.
It is fine for choosing 0 versus 180 degrees on an already aligned card, but it
cannot rank competing detections and it cannot guide a search.

This module projects the printed ink onto the row and column axes and correlates
those projections with the template's line positions. Both sides are smoothed, so
the score degrades smoothly with misalignment instead of collapsing at the first
pixel. Measured on the available raw photos (1800 x 1000 target, sigma 4): a
reference warp scores 0.41-0.53, a warp the old detector produced scores about
-0.06 to 0.13. The absolute ceiling is below 1 because handwriting distorts the
projections; the score is a ranking and gating signal, not a similarity metric.

Two scales are used:

* `sigma` around 4 template pixels ranks candidates and drives the fine steps of
  corner refinement.
* `sigma` around 22 template pixels keeps a wide basin, so the first, coarse
  refinement steps can pull a proposal that is 50-100 px out of place.
"""

from __future__ import annotations

import cv2
import numpy as np

from .geometry import CardTemplate

# Half-width, in template pixels, of the target peak at each printed line.
_TARGET_PAD = 1
FINE_SIGMA = 4.0
COARSE_SIGMA = 22.0


def smooth(values: np.ndarray, sigma: float) -> np.ndarray:
    """Gaussian smoothing without relying on the OpenCV signature variant."""
    if sigma <= 0:
        return np.asarray(values, dtype=np.float32)
    radius = max(1, int(round(3.0 * sigma)))
    offsets = np.arange(-radius, radius + 1, dtype=np.float32)
    kernel = np.exp(-(offsets**2) / (2.0 * sigma**2))
    kernel /= kernel.sum()
    return np.convolve(np.asarray(values, dtype=np.float32), kernel, mode="same").astype(
        np.float32
    )


def correlation(left: np.ndarray, right: np.ndarray) -> float:
    """Pearson correlation, 0.0 when either side carries no signal."""
    a = np.asarray(left, dtype=np.float32) - float(np.mean(left))
    b = np.asarray(right, dtype=np.float32) - float(np.mean(right))
    denominator = float(np.linalg.norm(a) * np.linalg.norm(b))
    if not denominator:
        return 0.0
    return float(a @ b / denominator)


class AlignmentScorer:
    """Template alignment score for a card warped to the template frame.

    `scale` shrinks the working warp. Corner refinement evaluates the score a few
    hundred times per photo, so it runs at half size; the final rectification
    still uses the full 1800 x 1000 template.
    """

    def __init__(
        self, template: CardTemplate, scale: float = 0.5, sigma: float = FINE_SIGMA
    ) -> None:
        if not 0.1 <= scale <= 1.0:
            raise ValueError("Alignment scale must be between 0.1 and 1.0.")
        if sigma <= 0:
            raise ValueError("Alignment sigma must be positive.")
        self.template = template
        self.scale = scale
        self.sigma = sigma
        self.width = max(1, int(round(template.width * scale)))
        self.height = max(1, int(round(template.height * scale)))
        self.table_x0 = self._scaled(template.table.x0)
        self.table_y0 = self._scaled(template.table.y0)
        self.table_x1 = self._scaled(template.table.x1)
        self.table_y1 = self._scaled(template.table.y1)
        self.row_target, self.col_target = self._targets()

    def _scaled(self, value: float) -> int:
        return int(round(value * self.scale))

    def _scaled_sigma(self) -> float:
        return max(0.5, self.sigma * self.scale)

    def _targets(self) -> tuple[np.ndarray, np.ndarray]:
        row_count = max(2, self.table_y1 - self.table_y0)
        col_count = max(2, self.table_x1 - self.table_x0)
        rows = np.zeros(row_count, dtype=np.float32)
        cols = np.zeros(col_count, dtype=np.float32)
        pad = max(1, self._scaled(_TARGET_PAD))
        for y in self.template.printed_row_edges:
            index = self._scaled(y) - self.table_y0
            if 0 <= index < row_count:
                rows[max(0, index - pad) : index + pad + 1] = 1.0
        x_edges, _ = self.template.table_edges()
        for x in x_edges:
            index = self._scaled(x) - self.table_x0
            if 0 <= index < col_count:
                cols[max(0, index - pad) : index + pad + 1] = 1.0
        sigma = self._scaled_sigma()
        return smooth(rows, sigma), smooth(cols, sigma)

    def warp(self, image: np.ndarray, quad: np.ndarray) -> np.ndarray:
        destination = np.array(
            [
                [0.0, 0.0],
                [self.width - 1.0, 0.0],
                [self.width - 1.0, self.height - 1.0],
                [0.0, self.height - 1.0],
            ],
            dtype=np.float32,
        )
        matrix = cv2.getPerspectiveTransform(np.asarray(quad, dtype=np.float32), destination)
        return cv2.warpPerspective(
            image,
            matrix,
            (self.width, self.height),
            flags=cv2.INTER_LINEAR,
            borderMode=cv2.BORDER_REPLICATE,
        )

    def score(self, card: np.ndarray) -> float:
        """Alignment of an already warped card, in -1..1 (0.4 or better is good)."""
        if card.ndim == 3:
            gray = cv2.cvtColor(card, cv2.COLOR_BGR2GRAY)
        else:
            gray = card
        if gray.shape[1] != self.width or gray.shape[0] != self.height:
            gray = cv2.resize(gray, (self.width, self.height), interpolation=cv2.INTER_AREA)
        window = max(3, (int(round(41 * self.scale)) // 2) * 2 + 1)
        ink = cv2.adaptiveThreshold(
            gray,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV,
            window,
            10,
        ).astype(np.float32)
        ink /= 255.0
        rows = ink[self.table_y0 : self.table_y1, self.table_x0 : self.table_x1].mean(axis=1)
        cols = ink[self.table_y0 : self.table_y1, self.table_x0 : self.table_x1].mean(axis=0)
        if rows.shape[0] != self.row_target.shape[0] or cols.shape[0] != self.col_target.shape[0]:
            return 0.0
        sigma = self._scaled_sigma()
        row_score = correlation(smooth(rows, sigma), self.row_target)
        col_score = correlation(smooth(cols, sigma), self.col_target)
        return 0.5 * row_score + 0.5 * col_score

    def score_quad(self, image: np.ndarray, quad: np.ndarray) -> float:
        return self.score(self.warp(image, quad))
