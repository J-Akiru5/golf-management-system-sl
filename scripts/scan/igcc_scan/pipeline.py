"""Image -> contract result. No model, no scores."""

from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor, as_completed

from .cells import CellCrop, crop_cells
from .classify import CellClassifier, CellPrediction, InferenceError
from .config import Settings
from .contract import HoleReading, PlayerReading, ScanResult, finalize_result
from .geometry import CardTemplate, get_template
from .rectify import rectify_card


class InvalidScanRequest(ValueError):
    reason = "invalid_request"


class UnknownTemplate(ValueError):
    reason = "unknown_template"


def _validate_mode(mode: str) -> str:
    normalized = (mode or "").strip().lower()
    if normalized not in {"individual", "group"}:
        raise InvalidScanRequest("mode must be individual or group.")
    return normalized


def _classify_all(
    classifier: CellClassifier,
    cells: list[CellCrop],
    *,
    workers: int,
) -> tuple[dict[tuple[int, int], CellPrediction], list[str]]:
    predictions: dict[tuple[int, int], CellPrediction] = {}
    errors: list[str] = []
    if workers <= 1:
        for cell in cells:
            try:
                predictions[(cell.row_index, cell.hole)] = classifier.classify(cell.masked)
            except Exception as exc:  # noqa: BLE001 - reported, never guessed
                errors.append(f"row {cell.row_index} hole {cell.hole}: {exc}")
        return predictions, errors

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {
            pool.submit(classifier.classify, cell.masked): cell for cell in cells
        }
        for future in as_completed(futures):
            cell = futures[future]
            try:
                predictions[(cell.row_index, cell.hole)] = future.result()
            except Exception as exc:  # noqa: BLE001
                errors.append(f"row {cell.row_index} hole {cell.hole}: {exc}")
    return predictions, errors


def scan_image(
    image,
    *,
    mode: str,
    template_id: str,
    classifier: CellClassifier,
    settings: Settings,
    template: CardTemplate | None = None,
) -> ScanResult:
    """Run the full pipeline. `image` is a BGR numpy array."""
    started = time.perf_counter()
    mode = _validate_mode(mode)
    try:
        template = template or get_template(template_id)
    except KeyError as exc:
        raise UnknownTemplate(str(exc)) from exc

    rectified = rectify_card(
        image,
        template,
        corners=settings.card_corners,
        mode=settings.card_mode,
        forced_rotation=settings.card_rotation,
        debug_dir=settings.debug_dir,
    )
    cells = crop_cells(rectified.image, template, mask_dots=settings.mask_dots)
    workers = min(settings.classify_concurrency, len(cells))
    predictions, errors = _classify_all(classifier, cells, workers=workers)
    if len(errors) == len(cells):
        raise InferenceError(
            "The model failed on every score cell; no result was returned. "
            f"First error: {errors[0]}"
        )
    if len(errors) > len(cells) // 2:
        raise InferenceError(
            f"The model failed on {len(errors)} of {len(cells)} score cells; "
            "refusing to return a mostly empty card as a successful scan."
        )

    players: list[PlayerReading] = []
    for row_index in range(len(template.player_rows)):
        holes: list[HoleReading] = []
        for hole_number in range(1, 19):
            prediction = predictions.get((row_index, hole_number))
            if prediction is None:
                holes.append(HoleReading(hole=hole_number, strokes=None, confidence=0.0))
                continue
            holes.append(
                HoleReading(
                    hole=hole_number,
                    strokes=prediction.strokes,
                    confidence=prediction.confidence,
                )
            )
        players.append(
            PlayerReading(
                row_index=row_index,
                name=None,
                written_total=None,
                holes=holes,
            )
        )

    dots_removed = sum(cell.removed_dots for cell in cells)
    warnings = list(rectified.warnings)
    if errors:
        warnings.append(
            f"{len(errors)} cell(s) could not be classified and were returned as null."
        )
    if settings.mask_dots and dots_removed == 0:
        warnings.append(
            "The printed-dot mask is enabled but removed nothing; "
            "check the template against a fresh card."
        )
    if not settings.mask_dots:
        warnings.append(
            "Printed-dot masking is off; the card prints stroke indexes in a separate row."
        )

    result = ScanResult(
        engine=classifier.engine,
        engine_version=classifier.version,
        players=players,
        raw={
            "template": template.template_id,
            "templateVersion": template.version,
            "mode": mode,
            "backend": classifier.engine,
            "card": {
                "autoDetected": rectified.auto_detected,
                "corners": [list(point) for point in rectified.corners]
                if rectified.corners
                else None,
                "orientation": rectified.orientation_degrees,
                "orientationScore": rectified.orientation_score,
                "orientationConfident": rectified.orientation_confident,
                "detectedBy": rectified.detected_by,
                "tableLevelled": rectified.table_levelled,
                "tableQuad": [list(point) for point in rectified.table_quad]
                if rectified.table_quad
                else None,
            },
            "cells": len(cells),
            "classified": len(predictions),
            "failed": len(errors),
            "dotsRemoved": dots_removed,
            "warnings": warnings,
            "durationMs": int((time.perf_counter() - started) * 1000),
        },
    )
    return finalize_result(result)
