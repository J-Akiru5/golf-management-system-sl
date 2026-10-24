import cv2
import numpy as np
import pytest
from synthetic import encode_png, make_card, make_photo

from igcc_scan.geometry import IGCC_PAPER
from igcc_scan.rectify import (
    CardNotFoundError,
    choose_orientation,
    decode_image,
    detect_card_quad,
    grid_alignment_score,
    order_quad,
    rectify_card,
    rotate_image,
)


def test_order_quad_returns_tl_tr_br_bl():
    points = np.array([[100, 100], [900, 120], [880, 600], [80, 580]], dtype=np.float32)
    ordered = order_quad(points)
    assert ordered.tolist() == [[100.0, 100.0], [900.0, 120.0], [880.0, 600.0], [80.0, 580.0]]


def test_detect_and_rectify_a_synthetic_photo():
    photo, corners = make_photo()
    found = detect_card_quad(photo)
    assert found is not None
    _quad, area_fraction = found
    assert area_fraction > 0.3
    rectified = rectify_card(photo, IGCC_PAPER)
    assert rectified.image.shape == (IGCC_PAPER.height, IGCC_PAPER.width, 3)
    assert rectified.auto_detected is True
    assert rectified.orientation_degrees == 0
    assert rectified.orientation_confident is True
    assert rectified.table_levelled is True
    assert rectified.corners is not None
    for actual, expected in zip(np.asarray(rectified.corners).reshape(-1), np.asarray(corners).reshape(-1)):
        assert abs(float(actual) - float(expected)) < 8


def test_manual_corners_are_honoured():
    card = make_card()
    rectified = rectify_card(
        card,
        IGCC_PAPER,
        corners=((0, 0), (IGCC_PAPER.width - 1, 0), (IGCC_PAPER.width - 1, IGCC_PAPER.height - 1), (0, IGCC_PAPER.height - 1)),
    )
    assert rectified.auto_detected is False
    assert rectified.orientation_degrees == 0
    score = grid_alignment_score(rectified.image, IGCC_PAPER)
    assert score > 0.2


def test_orientation_scoring_recovers_an_upside_down_card():
    card = make_card()
    rotated = rotate_image(card, 180)
    upright, degrees, score, confident = choose_orientation(rotated, IGCC_PAPER)
    assert degrees == 180
    assert confident is True
    assert score > 0.2
    # The recovered image should align better than the upside-down one.
    assert grid_alignment_score(upright, IGCC_PAPER) >= grid_alignment_score(rotated, IGCC_PAPER)


def test_prewarped_mode_resizes_without_detection():
    card = make_card()
    small = cv2.resize(card, (900, 500), interpolation=cv2.INTER_AREA)
    rectified = rectify_card(small, IGCC_PAPER, mode="prewarped")
    assert rectified.image.shape == (IGCC_PAPER.height, IGCC_PAPER.width, 3)
    assert rectified.orientation_degrees == 0


def test_table_leveling_corrects_a_small_rotation():
    card = make_card()
    matrix = cv2.getRotationMatrix2D((900, 500), 1.0, 1.0)
    skewed = cv2.warpAffine(
        card,
        matrix,
        (IGCC_PAPER.width, IGCC_PAPER.height),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(255, 255, 255),
    )
    before = grid_alignment_score(skewed, IGCC_PAPER)
    rectified = rectify_card(skewed, IGCC_PAPER, mode="prewarped")
    after = grid_alignment_score(rectified.image, IGCC_PAPER)
    assert rectified.table_levelled is True
    assert after > before
    assert rectified.table_quad is not None


def test_no_card_returns_a_clear_error():
    blank = np.full((1200, 900, 3), 90, dtype=np.uint8)
    with pytest.raises(CardNotFoundError, match="No scores were read"):
        rectify_card(blank, IGCC_PAPER)


def test_decode_image_accepts_png_and_rejects_garbage():
    card = make_card()
    decoded = decode_image(encode_png(card))
    assert decoded.shape == card.shape
    with pytest.raises(ValueError):
        decode_image(b"not an image")
