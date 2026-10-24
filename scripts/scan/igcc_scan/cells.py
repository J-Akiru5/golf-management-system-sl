"""Cell cropping, printed-dot masking and model input preparation."""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from .geometry import Box, CardTemplate


@dataclass
class CellCrop:
    row_index: int
    hole: int
    box: Box
    image: np.ndarray
    masked: np.ndarray
    removed_dots: int


@dataclass
class DotMaskResult:
    image: np.ndarray
    removed: int
    regions: list[tuple[int, int, int, int]]


def _clip_box(box: Box, width: int, height: int) -> Box:
    clipped = Box(
        max(0, box.x0),
        max(0, box.y0),
        min(width, box.x1),
        min(height, box.y1),
    )
    if clipped.width <= 0 or clipped.height <= 0:
        raise ValueError(f"Cell box {box.to_list()} is outside the card.")
    return clipped


def crop_box(image: np.ndarray, box: Box) -> np.ndarray:
    height, width = image.shape[:2]
    clipped = _clip_box(box, width, height)
    return image[clipped.y0 : clipped.y1, clipped.x0 : clipped.x1].copy()


def mask_printed_dots(
    cell: np.ndarray,
    template: CardTemplate,
    row_index: int,
    hole: int,
) -> DotMaskResult:
    """Remove small printed handicap dots from a score cell.

    The IGCC card is printed with small handicap dots near the top of each score
    cell. They are not handwriting and must not become model input. The exact dot
    positions are not legible in the only available photo, so this removes
    isolated, roughly circular ink blobs inside a conservative top-left window
    rather than blanking a fixed strip. A real handwritten stroke that is equally
    small and isolated in that window would also be removed; the window is
    configurable on `CardTemplate`.
    """
    cell_box = template.search_cell_box(row_index, hole)
    dot_box = template.dot_region_box(row_index, hole)
    x0 = max(0, dot_box.x0 - cell_box.x0)
    y0 = max(0, dot_box.y0 - cell_box.y0)
    x1 = min(cell.shape[1], dot_box.x1 - cell_box.x0)
    y1 = min(cell.shape[0], dot_box.y1 - cell_box.y0)
    if x1 <= x0 or y1 <= y0:
        return DotMaskResult(cell.copy(), 0, [])

    gray = cv2.cvtColor(cell, cv2.COLOR_BGR2GRAY)
    ink = cv2.adaptiveThreshold(
        gray,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        21,
        8,
    )
    roi = ink[y0:y1, x0:x1]
    count, _labels, stats, _ = cv2.connectedComponentsWithStats(roi, connectivity=8)
    cell_area = float(cell.shape[0] * cell.shape[1])
    max_area = max(4.0, template.dot_max_area_ratio * cell_area)
    max_size = max(2.0, template.dot_max_size_ratio * min(cell.shape[:2]))
    remove = np.zeros_like(gray, dtype=np.uint8)
    removed_regions: list[tuple[int, int, int, int]] = []
    for index in range(1, count):
        x, y, width, height, area = (int(value) for value in stats[index])
        if area < 2 or area > max_area:
            continue
        if width > max_size or height > max_size:
            continue
        aspect = width / float(height) if height else 0.0
        if not 0.35 <= aspect <= 2.8:
            continue
        fill = area / float(width * height) if width and height else 0.0
        if fill < 0.30:
            continue
        absolute_x = x0 + x
        absolute_y = y0 + y
        remove[absolute_y : absolute_y + height, absolute_x : absolute_x + width] = 255
        removed_regions.append((absolute_x, absolute_y, width, height))
    if removed_regions:
        remove = cv2.dilate(remove, np.ones((3, 3), np.uint8), iterations=1)
        masked = cell.copy()
        masked[remove > 0] = (255, 255, 255)
    else:
        masked = cell.copy()
    return DotMaskResult(masked, len(removed_regions), removed_regions)


def crop_cells(card: np.ndarray, template: CardTemplate) -> list[CellCrop]:
    crops: list[CellCrop] = []
    for row_index in range(len(template.player_rows)):
        for hole in range(1, 19):
            box = template.search_cell_box(row_index, hole)
            image = crop_box(card, box)
            dots = mask_printed_dots(image, template, row_index, hole)
            crops.append(
                CellCrop(
                    row_index=row_index,
                    hole=hole,
                    box=box,
                    image=image,
                    masked=dots.image,
                    removed_dots=dots.removed,
                )
            )
    return crops


def prepare_model_input(
    cell: np.ndarray,
    *,
    size: int = 64,
    channels: int = 1,
    layout: str = "nchw",
    normalize: str = "unit",
) -> np.ndarray:
    """Turn a BGR cell crop into the float tensor expected by the ONNX adapter.

    The cell is padded to a square with white, resized with area interpolation and
    normalised. This is the contract the local model must be trained/exported
    against; see `docs/SCORECARD_SCAN_MODEL.md`.
    """
    if channels not in {1, 3}:
        raise ValueError("Input channels must be 1 or 3.")
    if layout not in {"nchw", "nhwc"}:
        raise ValueError("Input layout must be nchw or nhwc.")
    if normalize not in {"unit", "minus_one_one", "imagenet", "none"}:
        raise ValueError(f"Unknown normalisation: {normalize}")
    if normalize == "imagenet" and channels != 3:
        raise ValueError("ImageNet normalisation requires 3 input channels.")

    gray = cv2.cvtColor(cell, cv2.COLOR_BGR2GRAY) if cell.ndim == 3 else cell
    height, width = gray.shape[:2]
    side = max(height, width)
    square = np.full((side, side), 255, dtype=np.uint8)
    top = (side - height) // 2
    left = (side - width) // 2
    square[top : top + height, left : left + width] = gray
    resized = cv2.resize(square, (size, size), interpolation=cv2.INTER_AREA)
    array = resized.astype(np.float32)
    if normalize == "unit":
        array /= 255.0
    elif normalize == "minus_one_one":
        array = array / 127.5 - 1.0
    elif normalize == "imagenet":
        array = array / 255.0
        if channels == 3:
            mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
            std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
            array = (np.repeat(array[..., None], 3, axis=2) - mean) / std
    if channels == 3 and array.ndim == 2:
        array = np.repeat(array[..., None], 3, axis=2)
    if channels == 1 and array.ndim == 2:
        array = array[..., None]
    if layout == "nchw":
        array = np.transpose(array, (2, 0, 1))
    return np.expand_dims(array, axis=0).astype(np.float32)


def draw_template_overlay(
    card: np.ndarray,
    template: CardTemplate,
    *,
    draw_dot_regions: bool = True,
) -> np.ndarray:
    """Debug rendering of every cell and dot window. Returns a copy."""
    overlay = card.copy()
    thickness = 2
    cv2.rectangle(
        overlay,
        (template.table.x0, template.table.y0),
        (template.table.x1, template.table.y1),
        (0, 180, 0),
        thickness,
    )
    for row_index in range(len(template.player_rows)):
        name = template.name_box(row_index)
        cv2.rectangle(
            overlay,
            (name.x0, name.y0),
            (name.x1, name.y1),
            (255, 140, 0),
            thickness,
        )
        for hole in range(1, 19):
            box = template.search_cell_box(row_index, hole)
            cv2.rectangle(
                overlay,
                (box.x0, box.y0),
                (box.x1, box.y1),
                (0, 0, 255),
                1,
            )
            if draw_dot_regions:
                dot = template.dot_region_box(row_index, hole)
                cv2.rectangle(
                    overlay,
                    (dot.x0, dot.y0),
                    (dot.x1, dot.y1),
                    (255, 0, 255),
                    1,
                )
            if row_index == 0 and hole in {1, 10}:
                cv2.putText(
                    overlay,
                    f"r{row_index}h{hole}",
                    (box.x0 + 2, box.y0 + 12),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.35,
                    (120, 0, 0),
                    1,
                    cv2.LINE_AA,
                )
    return overlay
