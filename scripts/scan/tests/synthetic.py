"""Synthetic cards for tests. No real photo and no model are needed."""

from __future__ import annotations

import cv2
import numpy as np

from igcc_scan.geometry import IGCC_PAPER, CardTemplate

DIGITS = {
    1: [8, 5, 7, 8, 4, 4, 7, 5, 8, 5, 7, 5, 5, 8, 8, 3, 7, 6],
    2: [6, 8, 8, 8, 5, 7, 6, 6, 8, 6, 7, 6, 5, 7, 7, 5, 6, 6],
}


def make_card(template: CardTemplate = IGCC_PAPER, *, with_dots: bool = True) -> np.ndarray:
    card = np.full((template.height, template.width, 3), 246, dtype=np.uint8)
    cv2.rectangle(card, (2, 2), (template.width - 3, template.height - 3), (35, 35, 35), 2)
    cv2.putText(
        card,
        "ILOILO GOLF & COUNTRY CLUB, INC.",
        (250, 80),
        cv2.FONT_HERSHEY_SIMPLEX,
        1.2,
        (20, 20, 20),
        3,
        cv2.LINE_AA,
    )
    cv2.putText(
        card,
        "PREFERRED LIES",
        (980, 70),
        cv2.FONT_HERSHEY_SIMPLEX,
        1.5,
        (20, 20, 20),
        4,
        cv2.LINE_AA,
    )
    cv2.putText(
        card,
        "EVENT",
        (250, 175),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        (40, 40, 40),
        2,
        cv2.LINE_AA,
    )
    cv2.line(card, (330, 185), (640, 185), (40, 40, 40), 2)
    cv2.putText(
        card,
        "FLIGHT NO:",
        (700, 175),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        (40, 40, 40),
        2,
        cv2.LINE_AA,
    )

    x_edges, y_edges = template.table_edges()
    for x in x_edges:
        cv2.line(
            card,
            (x, template.table.y0),
            (x, template.table.y1),
            (60, 60, 60),
            2,
        )
    for y in y_edges:
        cv2.line(
            card,
            (template.table.x0, y),
            (template.table.x1, y),
            (60, 60, 60),
            2,
        )

    names = ["", "Jon Bernardo", "Arnel Camel"]
    for row_index, name in enumerate(names):
        if name:
            name_box = template.name_box(row_index)
            cv2.putText(
                card,
                name,
                (name_box.x0 + 4, name_box.y0 + name_box.height - 8),
                cv2.FONT_HERSHEY_SCRIPT_SIMPLEX,
                0.8,
                (70, 70, 70),
                2,
                cv2.LINE_AA,
            )
        for hole in range(1, 19):
            box = template.search_cell_box(row_index, hole)
            if row_index in DIGITS:
                digit = DIGITS[row_index][hole - 1]
                text = str(digit)
                scale = 0.9
                thickness = 2
                (text_width, text_height), _baseline = cv2.getTextSize(
                    text, cv2.FONT_HERSHEY_SIMPLEX, scale, thickness
                )
                x = box.x0 + (box.width - text_width) // 2
                y = box.y0 + (box.height + text_height) // 2
                cv2.putText(
                    card,
                    text,
                    (x, y),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    scale,
                    (55, 55, 55),
                    thickness,
                    cv2.LINE_AA,
                )
            if with_dots:
                dot = template.dot_region_box(row_index, hole)
                cv2.circle(
                    card,
                    (dot.x0 + 3, dot.y0 + 3),
                    2,
                    (25, 25, 25),
                    -1,
                    cv2.LINE_AA,
                )
    return card


def make_photo(
    card: np.ndarray | None = None,
    *,
    background: tuple[int, int] = (2200, 1400),
) -> tuple[np.ndarray, tuple[tuple[float, float], ...]]:
    """Paste a synthetic card onto a gray background with perspective."""
    card = make_card() if card is None else card
    width, height = background
    photo = np.full((height, width, 3), 118, dtype=np.uint8)
    height_card, width_card = card.shape[:2]
    destination = np.array(
        [
            [180, 120],
            [width - 220, 150],
            [width - 250, height - 180],
            [150, height - 210],
        ],
        dtype=np.float32,
    )
    source = np.array(
        [[0, 0], [width_card - 1, 0], [width_card - 1, height_card - 1], [0, height_card - 1]],
        dtype=np.float32,
    )
    matrix = cv2.getPerspectiveTransform(source, destination)
    warped = cv2.warpPerspective(
        card,
        matrix,
        (width, height),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(118, 118, 118),
    )
    mask = cv2.warpPerspective(
        np.full((height_card, width_card), 255, dtype=np.uint8),
        matrix,
        (width, height),
        flags=cv2.INTER_NEAREST,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=0,
    )
    photo[mask > 0] = warped[mask > 0]
    corners = tuple((float(x), float(y)) for x, y in destination.tolist())
    return photo, corners


def encode_png(image: np.ndarray) -> bytes:
    ok, encoded = cv2.imencode(".png", image)
    if not ok:
        raise RuntimeError("Could not encode synthetic PNG.")
    return encoded.tobytes()
