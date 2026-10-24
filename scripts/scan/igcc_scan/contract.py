"""The JSON contract the Next.js app already validates.

Keep this file in step with `src/lib/scoring/scan/normalize.ts`. The app treats the
service output as untrusted: every player must contain holes 1-18 exactly once and
values must stay in range. This module builds that shape and can validate it before
the HTTP response is returned, so a bug in the pipeline fails loudly instead of
sending something the app will reject with a generic 502.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

HOLE_NUMBERS = tuple(range(1, 19))
MIN_STROKES = 1
MAX_STROKES = 20
MIN_TOTAL = 1
MAX_TOTAL = 300


@dataclass
class HoleReading:
    hole: int
    strokes: int | None
    confidence: float | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "hole": self.hole,
            "strokes": self.strokes,
            "confidence": self.confidence,
        }


@dataclass
class PlayerReading:
    row_index: int
    holes: list[HoleReading] = field(default_factory=list)
    name: str | None = None
    written_total: int | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "rowIndex": self.row_index,
            "name": self.name,
            "writtenTotal": self.written_total,
            "holes": [hole.to_dict() for hole in self.holes],
        }


@dataclass
class ScanResult:
    engine: str
    engine_version: str
    players: list[PlayerReading]
    raw: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "engine": self.engine,
            "engineVersion": self.engine_version,
            "players": [player.to_dict() for player in self.players],
            "raw": self.raw,
        }


def _number_or_none(value: Any, low: float, high: float) -> int | float | None:
    if value is None or value == "":
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not (low <= number <= high):
        return None
    return int(number) if float(number).is_integer() else number


def normalize_payload(payload: Any) -> dict[str, Any] | None:
    """Python counterpart of the app's `normalizeScanResult`.

    Returns the normalized payload, or `None` when the app would reject it.
    """
    if not isinstance(payload, dict):
        return None
    players_in = payload.get("players")
    engine = payload.get("engine")
    engine_version = payload.get("engineVersion")
    if not isinstance(players_in, list) or not players_in:
        return None
    if not isinstance(engine, str) or not engine.strip():
        return None
    if not isinstance(engine_version, str) or not engine_version.strip():
        return None

    players: list[dict[str, Any]] = []
    for candidate in players_in:
        if not isinstance(candidate, dict):
            return None
        holes_in = candidate.get("holes")
        if not isinstance(holes_in, list):
            return None
        holes: dict[int, dict[str, Any]] = {}
        for hole_candidate in holes_in:
            if not isinstance(hole_candidate, dict):
                return None
            try:
                hole_number = int(hole_candidate.get("hole"))
            except (TypeError, ValueError):
                return None
            if hole_number not in HOLE_NUMBERS or hole_number in holes:
                return None
            holes[hole_number] = {
                "hole": hole_number,
                "strokes": _number_or_none(
                    hole_candidate.get("strokes"), MIN_STROKES, MAX_STROKES
                ),
                "confidence": _number_or_none(hole_candidate.get("confidence"), 0.0, 1.0),
            }
        if len(holes) != 18:
            return None
        row_index = candidate.get("rowIndex")
        name = candidate.get("name")
        players.append(
            {
                "rowIndex": row_index if isinstance(row_index, int) else len(players),
                "name": name.strip() if isinstance(name, str) and name.strip() else None,
                "writtenTotal": _number_or_none(
                    candidate.get("writtenTotal"), MIN_TOTAL, MAX_TOTAL
                ),
                "holes": [holes[number] for number in HOLE_NUMBERS],
            }
        )
    return {
        "engine": engine.strip(),
        "engineVersion": engine_version.strip(),
        "players": players,
        "raw": payload.get("raw"),
    }


def validate_scan_result(result: ScanResult) -> list[str]:
    """Return human-readable contract errors. Empty means the app will accept it."""
    payload = result.to_dict()
    problems: list[str] = []
    if normalize_payload(payload) is None:
        problems.append("The payload does not match the app's scan contract.")
    for player in result.players:
        if len(player.holes) != 18:
            problems.append(
                f"Row {player.row_index} has {len(player.holes)} holes, expected 18."
            )
    return problems


def finalize_result(result: ScanResult) -> ScanResult:
    """Order holes, clamp confidence and drop out-of-range scores in place.

    A model that cannot read a cell must produce `strokes=None`. This function
    never fills a missing cell; it only removes values the app would reject.
    """
    for player in result.players:
        by_hole = {hole.hole: hole for hole in player.holes}
        ordered: list[HoleReading] = []
        for number in HOLE_NUMBERS:
            hole = by_hole.get(number)
            if hole is None:
                raise ValueError(
                    f"Row {player.row_index} is missing hole {number}; refusing to invent it."
                )
            strokes = hole.strokes
            if strokes is not None and not (MIN_STROKES <= int(strokes) <= MAX_STROKES):
                strokes = None
            confidence = hole.confidence
            if confidence is not None:
                confidence = min(1.0, max(0.0, float(confidence)))
            ordered.append(HoleReading(hole=number, strokes=strokes, confidence=confidence))
        player.holes = ordered
        if player.written_total is not None and not (
            MIN_TOTAL <= int(player.written_total) <= MAX_TOTAL
        ):
            player.written_total = None
    problems = validate_scan_result(result)
    if problems:
        raise ValueError("; ".join(problems))
    return result
