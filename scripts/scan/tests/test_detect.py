import cv2
import numpy as np
import pytest
from synthetic import make_card, make_photo

from igcc_scan.align import AlignmentScorer
from igcc_scan.detect import detect_card, image_quality, refine_quad
from igcc_scan.features import CardTemplateMatcher
from igcc_scan.geometry import IGCC_PAPER
from igcc_scan.quads import corner_angles, order_quad, quad_aspect
from igcc_scan.rectify import CardNotFoundError, rectify_card


def test_order_quad_orders_corners_and_reports_the_card_aspect():
    points = np.array([[880, 600], [100, 100], [80, 580], [900, 120]], dtype=np.float32)
    ordered = order_quad(points)
    assert ordered.tolist() == [[100.0, 100.0], [900.0, 120.0], [880.0, 600.0], [80.0, 580.0]]
    assert 1.4 < quad_aspect(ordered) < 2.0


def test_order_quad_refuses_repeated_corners():
    with pytest.raises(ValueError):
        order_quad([[10, 10], [10, 10], [200, 10], [10, 200]])


def test_corner_angles_of_a_rectangle_are_right_angles():
    angles = corner_angles(np.array([[0, 0], [400, 0], [400, 200], [0, 200]], dtype=np.float32))
    assert all(abs(angle - 90.0) < 0.5 for angle in angles)


def test_alignment_score_prefers_the_template_orientation():
    scorer = AlignmentScorer(IGCC_PAPER, scale=0.5)
    card = make_card()
    upright = scorer.score(card)
    flipped = scorer.score(cv2.rotate(card, cv2.ROTATE_180))
    assert upright > 0.25
    assert upright > flipped


def test_refine_quad_improves_a_shifted_quadrilateral():
    photo, corners = make_photo()
    scorer = AlignmentScorer(IGCC_PAPER, scale=0.5)
    shifted = np.asarray(corners, dtype=np.float32) + np.array(
        [[16.0, -12.0], [14.0, 16.0], [-16.0, 12.0], [-12.0, -16.0]], dtype=np.float32
    )
    before = scorer.score_quad(photo, shifted)
    _refined, after = refine_quad(photo, shifted, scorer, steps=(12, 6, 3, 1))
    assert after >= before


def test_feature_matcher_locates_a_perspective_photo():
    card = make_card()
    matcher = CardTemplateMatcher.from_image(card)
    photo, corners = make_photo(card)
    rectified = rectify_card(photo, IGCC_PAPER, matcher=matcher)
    assert rectified.detected_by == "template_features"
    assert rectified.detection is not None
    assert rectified.detection.inliers >= 30
    assert rectified.detection.confidence == "high"
    assert rectified.corners is not None
    for actual, expected in zip(
        np.asarray(rectified.corners).reshape(-1), np.asarray(corners).reshape(-1)
    ):
        assert abs(float(actual) - float(expected)) < 12


def test_a_blank_photo_has_no_detection():
    blank = np.full((1200, 900, 3), 92, dtype=np.uint8)
    assert detect_card(blank, IGCC_PAPER) is None
    with pytest.raises(CardNotFoundError, match="No scores were read"):
        rectify_card(blank, IGCC_PAPER)


def test_a_competing_rectangle_is_not_accepted():
    # A card-shaped whiteboard with no printed table: the outline is plausible,
    # so only the alignment score can reject it.
    photo = np.full((1200, 1600, 3), 110, dtype=np.uint8)
    cv2.rectangle(photo, (200, 200), (1400, 870), (246, 246, 246), -1)
    cv2.rectangle(photo, (200, 200), (1400, 870), (40, 40, 40), 3)
    detection = detect_card(photo, IGCC_PAPER)
    assert detection is not None
    assert detection.decision in {"reject", "retake"}
    assert detection.confidence == "low"
    with pytest.raises(CardNotFoundError, match="No scores were read"):
        rectify_card(photo, IGCC_PAPER, matcher=CardTemplateMatcher.from_image(make_card()))


def test_a_dark_photo_is_flagged_by_the_quality_check():
    dark = np.full((800, 600, 3), 25, dtype=np.uint8)
    quality = image_quality(dark)
    assert quality.brightness < 55
    assert any("dark" in warning.lower() for warning in quality.warnings)
