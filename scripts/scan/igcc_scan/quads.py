"""Pure quadrilateral helpers shared by the detector and the rectifier."""

from __future__ import annotations

import math

import cv2
import numpy as np


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


def quad_side_lengths(quad: np.ndarray) -> tuple[float, float, float, float]:
    pts = np.asarray(quad, dtype=np.float32).reshape(4, 2)
    return tuple(
        float(np.linalg.norm(pts[(index + 1) % 4] - pts[index])) for index in range(4)
    )  # type: ignore[return-value]


def quad_aspect(quad: np.ndarray) -> float:
    """Long side over short side, averaged across the two opposite pairs."""
    top, right, bottom, left = quad_side_lengths(quad)
    long_side = max((top + bottom) / 2.0, (left + right) / 2.0)
    short_side = min((top + bottom) / 2.0, (left + right) / 2.0)
    return float(long_side / short_side) if short_side else 0.0


def quad_area(quad: np.ndarray) -> float:
    return float(abs(cv2.contourArea(np.asarray(quad, dtype=np.float32).reshape(-1, 1, 2))))


def is_convex(quad: np.ndarray) -> bool:
    pts = np.asarray(quad, dtype=np.float32).reshape(-1, 1, 2)
    return bool(cv2.isContourConvex(pts))


def corner_angles(quad: np.ndarray) -> tuple[float, float, float, float]:
    """Interior angles in degrees, in TL, TR, BR, BL order."""
    pts = np.asarray(quad, dtype=np.float32).reshape(4, 2)
    angles: list[float] = []
    for index in range(4):
        previous = pts[(index - 1) % 4] - pts[index]
        following = pts[(index + 1) % 4] - pts[index]
        denominator = float(np.linalg.norm(previous) * np.linalg.norm(following))
        if not denominator:
            angles.append(0.0)
            continue
        cosine = float(np.dot(previous, following) / denominator)
        angles.append(math.degrees(math.acos(max(-1.0, min(1.0, cosine)))))
    return tuple(angles)  # type: ignore[return-value]


def edge_support(edges: np.ndarray, quad: np.ndarray, *, samples: int = 80) -> float:
    """Fraction of the quadrilateral perimeter that sits on a detected edge.

    `edges` is a binary edge map that should already be dilated a little, so a
    line that is one or two pixels inside the quad still counts.
    """
    height, width = edges.shape[:2]
    pts = np.asarray(quad, dtype=np.float32).reshape(4, 2)
    hits = 0
    total = 0
    for index in range(4):
        start = pts[index]
        end = pts[(index + 1) % 4]
        for step in range(samples):
            point = start + (end - start) * (step / float(samples - 1))
            x = int(round(float(point[0])))
            y = int(round(float(point[1])))
            if not (0 <= x < width and 0 <= y < height):
                total += 1
                continue
            total += 1
            if edges[y, x]:
                hits += 1
    return hits / float(total) if total else 0.0
