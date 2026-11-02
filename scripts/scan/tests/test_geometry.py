import itertools
import json
from pathlib import Path

import pytest

from igcc_scan.geometry import IGCC_PAPER, Box, get_template

MEASURED_GRID = Path(__file__).parent / "fixtures" / "igcc_grid_measured.json"


def test_igcc_template_has_eighteen_holes_and_four_rows():
    template = get_template("igcc-paper")
    assert template is IGCC_PAPER
    assert len(template.hole_columns) == 18
    assert len(template.player_rows) == 4


def test_every_cell_is_inside_the_table_and_does_not_overlap():
    template = IGCC_PAPER
    cells = [
        template.search_cell_box(row, hole)
        for row in range(4)
        for hole in range(1, 19)
    ]
    assert len(cells) == 72
    for cell in cells:
        assert template.table.contains(cell)
        assert cell.width > 30
        assert cell.height > 20
    for row in range(4):
        row_cells = [template.search_cell_box(row, hole) for hole in range(1, 19)]
        for left, right in itertools.pairwise(row_cells):
            assert left.x1 <= right.x0


def test_dot_region_is_inside_its_cell():
    template = IGCC_PAPER
    for row in range(4):
        for hole in range(1, 19):
            cell = template.search_cell_box(row, hole)
            dot = template.dot_region_box(row, hole)
            assert cell.contains(dot)
            assert dot.width >= 2
            assert dot.height >= 2


def test_out_of_range_cells_raise():
    with pytest.raises(ValueError):
        IGCC_PAPER.cell_box(4, 1)
    with pytest.raises(ValueError):
        IGCC_PAPER.cell_box(0, 0)
    with pytest.raises(ValueError):
        IGCC_PAPER.cell_box(0, 19)


def test_box_helpers():
    box = Box(10, 20, 50, 60)
    assert box.width == 40
    assert box.height == 40
    assert box.center == (30.0, 40.0)
    assert box.inset(5, 5, 5, 5).to_list() == [15, 25, 45, 55]
    assert box.contains(Box(20, 30, 40, 50))
    assert not box.contains(Box(0, 0, 60, 60))


def test_unknown_template_is_named():
    with pytest.raises(KeyError, match="igcc-paper"):
        get_template("some-other-card")


def test_table_edges_are_sorted_and_unique():
    x_edges, y_edges = IGCC_PAPER.table_edges()
    assert list(x_edges) == sorted(set(x_edges))
    assert list(y_edges) == sorted(set(y_edges))
    assert x_edges[0] == IGCC_PAPER.table.x0
    assert x_edges[-1] == IGCC_PAPER.table.x1
    assert y_edges[0] == IGCC_PAPER.table.y0
    assert y_edges[-1] == IGCC_PAPER.table.y1


def test_template_columns_match_the_measured_grid():
    measured = json.loads(MEASURED_GRID.read_text(encoding="utf-8"))["measured_x_lines"]
    template = IGCC_PAPER
    edges = [template.name_column[1]]
    edges += [column[1] for column in template.hole_columns[:9]]
    edges.append(template.total_columns["out"][1])
    edges += [column[1] for column in template.hole_columns[9:]]
    edges += [template.total_columns[name][1] for name in ("in", "total", "handicap")]
    assert len(edges) == len(measured) == 23
    for edge, expected in zip(edges, measured, strict=True):
        assert abs(edge - expected) <= 1.0, (edge, expected)
