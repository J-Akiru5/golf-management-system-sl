import cv2
import numpy as np
import pytest
from synthetic import make_card

from igcc_scan.cells import (
    crop_box,
    crop_cells,
    draw_template_overlay,
    prepare_model_input,
)
from igcc_scan.geometry import IGCC_PAPER


def test_crop_every_cell_from_a_synthetic_card():
    card = make_card()
    cells = crop_cells(card, IGCC_PAPER)
    assert len(cells) == 54
    assert {(cell.row_index, cell.hole) for cell in cells} == {
        (row, hole) for row in range(3) for hole in range(1, 19)
    }
    for cell in cells:
        assert cell.image.shape[0] > 20
        assert cell.image.shape[1] > 30
        assert cell.masked.shape == cell.image.shape
        assert cell.removed_dots >= 1


def test_printed_dots_are_removed_and_digit_is_kept():
    card = make_card()
    cells = crop_cells(card, IGCC_PAPER)
    cell = next(item for item in cells if item.row_index == 1 and item.hole == 1)
    dot_box = IGCC_PAPER.dot_region_box(1, 1)
    relative_x = dot_box.x0 - cell.box.x0
    relative_y = dot_box.y0 - cell.box.y0
    before = cell.image[
        relative_y : relative_y + dot_box.height,
        relative_x : relative_x + dot_box.width,
    ]
    after = cell.masked[
        relative_y : relative_y + dot_box.height,
        relative_x : relative_x + dot_box.width,
    ]
    assert (cv2.cvtColor(before, cv2.COLOR_BGR2GRAY) < 100).any()
    assert not (cv2.cvtColor(after, cv2.COLOR_BGR2GRAY) < 100).any()

    center = cell.masked[
        cell.masked.shape[0] // 3 : 2 * cell.masked.shape[0] // 3,
        cell.masked.shape[1] // 4 : 3 * cell.masked.shape[1] // 4,
    ]
    assert (cv2.cvtColor(center, cv2.COLOR_BGR2GRAY) < 180).any()


def test_blank_card_has_no_dots_to_remove():
    card = make_card(with_dots=False)
    cells = crop_cells(card, IGCC_PAPER)
    row_zero = [cell for cell in cells if cell.row_index == 0]
    assert all(cell.removed_dots == 0 for cell in row_zero)


def test_prepare_model_input_contract():
    card = make_card()
    cell = next(
        item for item in crop_cells(card, IGCC_PAPER) if item.row_index == 1 and item.hole == 1
    )
    tensor = prepare_model_input(cell.masked, size=48, channels=1, layout="nchw")
    assert tensor.shape == (1, 1, 48, 48)
    assert tensor.dtype == np.float32
    assert 0.0 <= float(tensor.min()) <= float(tensor.max()) <= 1.0

    rgb = prepare_model_input(
        cell.masked, size=32, channels=3, layout="nhwc", normalize="minus_one_one"
    )
    assert rgb.shape == (1, 32, 32, 3)
    assert -1.0 <= float(rgb.min()) <= float(rgb.max()) <= 1.0

    with pytest.raises(ValueError, match="requires 3 input channels"):
        prepare_model_input(cell.masked, channels=1, normalize="imagenet")


def test_crop_box_rejects_outside_box():
    card = make_card()
    try:
        crop_box(card, IGCC_PAPER.table.__class__(0, 0, 0, 10))
    except ValueError:
        pass
    else:
        raise AssertionError("An empty box should be rejected.")


def test_overlay_has_the_same_size():
    card = make_card()
    overlay = draw_template_overlay(card, IGCC_PAPER)
    assert overlay.shape == card.shape
    assert overlay is not card
