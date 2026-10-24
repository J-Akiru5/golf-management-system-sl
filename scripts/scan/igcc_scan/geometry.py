"""Canonical geometry for the printed IGCC scorecard.

The coordinates below are pixels on a card that has been perspective-corrected to
1800 x 1000. They were measured once, by hand, from the only filled card available
(`golf score Sheet.jpg`). That photo is rotated 90 degrees and skewed; the measured
corners and the resulting rectified image are recorded in
`igcc_photo_calibration.json` and `docs/SCORECARD_SCAN_MODEL.md`.

This is a *template*, not a detector. If the club reprints the card or the scan is
not rectified to this frame, the boxes will be wrong. Keep `template_id` in the
scan response so a future template can be selected explicitly.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Box:
    """Axis-aligned pixel box. `x1` and `y1` are exclusive."""

    x0: int
    y0: int
    x1: int
    y1: int

    @property
    def width(self) -> int:
        return self.x1 - self.x0

    @property
    def height(self) -> int:
        return self.y1 - self.y0

    @property
    def center(self) -> tuple[float, float]:
        return ((self.x0 + self.x1) / 2.0, (self.y0 + self.y1) / 2.0)

    def inset(self, left: int, top: int, right: int, bottom: int) -> Box:
        box = Box(self.x0 + left, self.y0 + top, self.x1 - right, self.y1 - bottom)
        if box.width <= 0 or box.height <= 0:
            raise ValueError("Box inset removed the whole cell.")
        return box

    def to_list(self) -> list[int]:
        return [self.x0, self.y0, self.x1, self.y1]

    def contains(self, other: Box) -> bool:
        return (
            self.x0 <= other.x0
            and self.y0 <= other.y0
            and self.x1 >= other.x1
            and self.y1 >= other.y1
        )


# Column edges measured on the rectified 1800 x 1000 card. The name column runs
# from 115 to 383; the nine front-nine hole cells and the nine back-nine cells
# are separated by the printed OUT column.
_NAME_COLUMN = (115, 383)
_HOLE_COLUMNS: tuple[tuple[int, int], ...] = (
    (383, 442),
    (442, 500),
    (500, 556),
    (556, 615),
    (615, 672),
    (672, 731),
    (731, 789),
    (789, 848),
    (848, 906),
    (964, 1024),
    (1024, 1082),
    (1082, 1143),
    (1143, 1200),
    (1200, 1259),
    (1259, 1319),
    (1319, 1375),
    (1375, 1431),
    (1431, 1492),
)
_TOTAL_COLUMNS: dict[str, tuple[int, int]] = {
    "out": (906, 964),
    "in": (1492, 1549),
    "total": (1549, 1608),
    "handicap": (1608, 1668),
    "net": (1668, 1733),
}
# Four printed player rows. Rows 0 and 2 are empty on the available card; rows 1
# and 3 carry the two handwritten scores. Row indices in the scan contract are 0-based.
_PLAYER_ROWS: tuple[tuple[int, int], ...] = (
    (435, 486),
    (486, 531),
    (531, 582),
    (582, 627),
)


@dataclass(frozen=True)
class CardTemplate:
    template_id: str
    version: str
    width: int
    height: int
    table: Box
    name_column: tuple[int, int]
    hole_columns: tuple[tuple[int, int], ...]
    player_rows: tuple[tuple[int, int], ...]
    total_columns: dict[str, tuple[int, int]]
    # Every printed horizontal table line, including the rating, par and
    # handicap rows. Used only for orientation scoring and debug overlays.
    printed_row_edges: tuple[int, ...] = (
        240,
        271,
        309,
        346,
        386,
        435,
        486,
        531,
        582,
        627,
        678,
        725,
        770,
    )
    cell_inset: int = 5
    # The IGCC "Preferred Lies" card has no printed handicap dots inside the score
    # cells; the stroke indexes are printed in a separate row. Masking is off by
    # default so a stray dot remover cannot eat the top of a handwritten digit.
    mask_printed_dots: bool = False
    # Fractional search window inside each score cell where the card's small
    # printed handicap dots sit. The window is relative to the cell box.
    dot_search_region: tuple[float, float, float, float] = (0.03, 0.02, 0.40, 0.30)
    # Blobs larger than this fraction of the cell are never treated as dots.
    dot_max_area_ratio: float = 0.02
    # A dot must fit in this fraction of the cell's short side.
    dot_max_size_ratio: float = 0.22

    def __post_init__(self) -> None:
        if len(self.hole_columns) != 18:
            raise ValueError("The IGCC template must define exactly 18 hole columns.")
        if len(self.player_rows) != 4:
            raise ValueError("The IGCC template must define exactly 4 player rows.")
        for column in self.hole_columns:
            if not (self.table.x0 <= column[0] < column[1] <= self.table.x1):
                raise ValueError("A hole column falls outside the table.")
        for row in self.player_rows:
            if not (self.table.y0 <= row[0] < row[1] <= self.table.y1):
                raise ValueError("A player row falls outside the table.")

    def cell_box(self, row_index: int, hole: int, inset: int | None = None) -> Box:
        self.check_row_hole(row_index, hole)
        x0, x1 = self.hole_columns[hole - 1]
        y0, y1 = self.player_rows[row_index]
        box = Box(x0, y0, x1, y1)
        return box.inset(inset, inset, inset, inset) if inset else box

    def search_cell_box(self, row_index: int, hole: int) -> Box:
        """Cell box with the default inset, used for cropping and labelling."""
        return self.cell_box(row_index, hole, self.cell_inset)

    def dot_region_box(self, row_index: int, hole: int) -> Box:
        """Absolute box of the printed-dot search window inside a score cell."""
        cell = self.search_cell_box(row_index, hole)
        fx0, fy0, fx1, fy1 = self.dot_search_region
        box = Box(
            round(cell.x0 + fx0 * cell.width),
            round(cell.y0 + fy0 * cell.height),
            round(cell.x0 + fx1 * cell.width),
            round(cell.y0 + fy1 * cell.height),
        )
        if not cell.contains(box):
            raise ValueError("Dot region must stay inside its cell.")
        return box

    def name_box(self, row_index: int) -> Box:
        self.check_row_index(row_index)
        y0, y1 = self.player_rows[row_index]
        return Box(
            self.name_column[0] + self.cell_inset,
            y0 + 2,
            self.name_column[1] - self.cell_inset,
            y1 - 2,
        )

    def total_box(self, row_index: int, column: str = "total") -> Box:
        self.check_row_index(row_index)
        if column not in self.total_columns:
            raise KeyError(f"Unknown total column: {column}")
        x0, x1 = self.total_columns[column]
        y0, y1 = self.player_rows[row_index]
        return Box(x0 + self.cell_inset, y0 + 2, x1 - self.cell_inset, y1 - 2)

    def check_row_hole(self, row_index: int, hole: int) -> None:
        self.check_row_index(row_index)
        if not 1 <= hole <= 18:
            raise ValueError(f"Hole must be 1..18, got {hole}.")

    def check_row_index(self, row_index: int) -> None:
        if not 0 <= row_index < len(self.player_rows):
            raise ValueError(
                f"Player row must be 0..{len(self.player_rows) - 1}, got {row_index}."
            )

    def table_edges(self) -> tuple[tuple[int, ...], tuple[int, ...]]:
        """Vertical and horizontal printed table edges, for orientation scoring."""
        x_edges = (
            self.table.x0,
            self.name_column[0],
            self.name_column[1],
            *(x for pair in self.hole_columns for x in pair),
            *(x for pair in self.total_columns.values() for x in pair),
            self.table.x1,
        )
        y_edges = self.printed_row_edges
        return tuple(sorted(set(x_edges))), tuple(sorted(set(y_edges)))


IGCC_PAPER = CardTemplate(
    template_id="igcc-paper",
    version="2026-10",
    width=1800,
    height=1000,
    table=Box(115, 240, 1733, 770),
    name_column=_NAME_COLUMN,
    hole_columns=_HOLE_COLUMNS,
    player_rows=_PLAYER_ROWS,
    total_columns=_TOTAL_COLUMNS,
)

TEMPLATES: dict[str, CardTemplate] = {IGCC_PAPER.template_id: IGCC_PAPER}


def get_template(template_id: str) -> CardTemplate:
    try:
        return TEMPLATES[template_id]
    except KeyError as exc:
        raise KeyError(
            f"Unknown card template {template_id!r}. Known templates: "
            + ", ".join(sorted(TEMPLATES))
        ) from exc
