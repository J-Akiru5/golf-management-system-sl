"""Compare a raw-photo scan against the same card scanned from a reference warp.

The reference warps (cards already rectified to 1800 x 1000) are the known-good
input for the digit model. Reading both the raw photo and its reference warp with
the same classifier isolates the detection and rectification step: any cell that
differs is a rectification loss, not a classification loss.

    python eval_end_to_end.py --photos ../../.tmp/scorecard-samples/raw \
        --reference ../../.tmp/scorecard-samples/prepared/rectified_v2 --limit 20

This needs the local ONNX model configured the same way as the service.
"""

from __future__ import annotations

import argparse
import csv
import time
from collections import Counter
from dataclasses import replace
from pathlib import Path

from igcc_scan.classify import build_classifier
from igcc_scan.config import Settings
from igcc_scan.geometry import IGCC_PAPER
from igcc_scan.pipeline import scan_image
from igcc_scan.rectify import CardNotFoundError, decode_image


def read_cells(result) -> dict[tuple[int, int], int | None]:
    return {
        (player.row_index, hole.hole): hole.strokes
        for player in result.players
        for hole in player.holes
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--photos", required=True, type=Path)
    parser.add_argument("--reference", required=True, type=Path)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--csv", type=Path, default=None)
    args = parser.parse_args()

    settings = Settings.from_env()
    classifier = build_classifier(settings)
    photos = sorted(args.photos.glob("*.jpg")) + sorted(args.photos.glob("*.png"))
    if args.limit:
        photos = photos[: args.limit]

    rows: list[dict[str, object]] = []
    totals = Counter()
    started = time.perf_counter()
    for path in photos:
        reference_path = args.reference / f"{path.stem}.png"
        if not reference_path.exists():
            continue
        reference_image = decode_image(reference_path.read_bytes())
        try:
            reference = scan_image(
                reference_image,
                mode="individual",
                template_id=IGCC_PAPER.template_id,
                classifier=classifier,
                settings=replace(settings, card_mode="prewarped"),
            )
        except Exception as exc:  # noqa: BLE001 - reported, never hidden
            print(f"{path.stem} reference failed: {exc}")
            continue
        expected = read_cells(reference)
        row: dict[str, object] = {"stem": path.stem}
        try:
            raw = scan_image(
                decode_image(path.read_bytes()),
                mode="individual",
                template_id=IGCC_PAPER.template_id,
                classifier=classifier,
                settings=settings,
            )
        except CardNotFoundError as exc:
            row.update({"decision": "card_not_detected", "matched": 0, "cells": 0})
            rows.append(row)
            totals["card_not_detected"] += 1
            print(f"{path.stem} card_not_detected: {exc}")
            continue
        actual = read_cells(raw)
        card = raw.raw.get("card", {}) if isinstance(raw.raw, dict) else {}
        matched = sum(1 for key, value in expected.items() if actual.get(key) == value)
        compared = len(expected)
        row.update(
            {
                "decision": card.get("decision"),
                "confidence": card.get("confidence"),
                "alignment": card.get("alignment"),
                "inliers": card.get("featureInliers"),
                "detectedBy": card.get("detectedBy"),
                "cells": compared,
                "matched": matched,
                "cellAccuracy": round(matched / compared, 3) if compared else 0.0,
            }
        )
        rows.append(row)
        totals["scanned"] += 1
        print(
            f"{path.stem} {row['decision']} align={row['alignment']} "
            f"inliers={row['inliers']} cells {matched}/{compared}"
        )

    print()
    print(f"{totals['scanned']} photos scanned, {totals['card_not_detected']} rejected")
    if rows:
        accuracies = [float(row["cellAccuracy"]) for row in rows if "cellAccuracy" in row]
        if accuracies:
            accuracies.sort()
            print(
                f"cell agreement with the reference warp: median "
                f"{accuracies[len(accuracies) // 2]:.3f}, min {accuracies[0]:.3f}, "
                f"max {accuracies[-1]:.3f}"
            )
            perfect = sum(1 for value in accuracies if value == 1.0)
            print(f"cards with every cell identical: {perfect}/{len(accuracies)}")
    if args.csv is not None:
        with args.csv.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=sorted({k for row in rows for k in row}))
            writer.writeheader()
            writer.writerows(rows)
        print(f"wrote {args.csv}")
    print(f"finished in {time.perf_counter() - started:.0f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
