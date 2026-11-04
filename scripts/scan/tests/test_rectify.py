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
    assert rectified.detected_by == "card"
    assert rectified.orientation_degrees == 0
    assert rectified.orientation_confident is True
    assert rectified.table_levelled is True
    assert rectified.corners is not None
    for actual, expected in zip(np.asarray(rectified.corners).reshape(-1), np.asarray(corners).reshape(-1)):
        assert abs(float(actual) - float(expected)) < 8


def test_table_detection_when_the_card_outline_is_absent():
    card = make_card()
    table = IGCC_PAPER.table
    # Keep only the printed table: the card outline is gone, so card detection
    # must fail and the table fallback must carry the rectification. Build the
    # photo by hand so the table keeps its true aspect ratio.
    cropped = card[table.y0 : table.y1, table.x0 : table.x1]
    height, width = cropped.shape[:2]
    photo = np.full((height + 200, width + 200, 3), 118, dtype=np.uint8)
    source = np.array(
        [[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]],
        dtype=np.float32,
    )
    destination = np.array(
        [[100, 100], [width + 80, 120], [width + 60, height + 80], [80, height + 90]],
        dtype=np.float32,
    )
    matrix = cv2.getPerspectiveTransform(source, destination)
    warped = cv2.warpPerspective(
        cropped,
        matrix,
        (photo.shape[1], photo.shape[0]),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(118, 118, 118),
    )
    mask = cv2.warpPerspective(
        np.full((height, width), 255, dtype=np.uint8),
        matrix,
        (photo.shape[1], photo.shape[0]),
        flags=cv2.INTER_NEAREST,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=0,
    )
    photo[mask > 0] = warped[mask > 0]
    assert detect_card_quad(photo) is None
    rectified = rectify_card(photo, IGCC_PAPER)
    assert rectified.auto_detected is True
    assert rectified.detected_by == "table"
    assert rectified.table_levelled is True
    assert rectified.table_quad is not None
    gray = cv2.cvtColor(rectified.image, cv2.COLOR_BGR2GRAY)
    for x in (table.x0 + 200, table.x0 + 800, table.x0 + 1400):
        assert gray[table.y0 - 3 : table.y0 + 4, x].min() < 200
        assert gray[table.y1 - 4 : table.y1 + 3, x].min() < 210


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


def test_orientation_keeps_the_template_frame():
    card = make_card()
    upright, degrees, _score, _confident = choose_orientation(card, IGCC_PAPER)
    assert degrees in {0, 180}
    assert upright.shape[:2] == (IGCC_PAPER.height, IGCC_PAPER.width)


def test_orientation_refuses_a_portrait_card():
    # A 90 degree turn puts the template cell boxes outside the image, so it must
    # never be chosen. A card that arrives portrait is a failed rectification.
    portrait = rotate_image(make_card(), 90)
    with pytest.raises(CardNotFoundError, match="template frame"):
        choose_orientation(portrait, IGCC_PAPER)


def test_rectified_card_always_matches_the_template_frame():
    photo, _corners = make_photo()
    rectified = rectify_card(photo, IGCC_PAPER)
    assert rectified.image.shape[:2] == (IGCC_PAPER.height, IGCC_PAPER.width)


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


def test_prewarped_mode_rejects_a_portrait_image():
    portrait = rotate_image(make_card(), 90)
    with pytest.raises(CardNotFoundError, match="template orientation"):
        rectify_card(portrait, IGCC_PAPER, mode="prewarped")


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
