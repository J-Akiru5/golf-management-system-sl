"""Measure card detection against reference quadrilaterals.

Two modes:

* `--reference path/to/reference.json` uses hand-checked or matched card corners
  (`{stem: {"quad": [[x, y], ...]}}`, original photo pixels, TL TR BR BL).
* Without a reference file the script reports the detector's own scores and
  decision counts only. It never invents an accuracy figure.

Example:

    python eval_detection.py --photos ../../.tmp/scorecard-samples/raw \
        --reference ../../.tmp/card-gt.json --limit 20
"""

from __future__ import annotations

import argparse
import csv
import json
import time
from pathlib import Path

import numpy as np

from igcc_scan.align import AlignmentScorer
from igcc_scan.detect import detect_card
from igcc_scan.features import load_default_matcher
from igcc_scan.geometry import IGCC_PAPER
from igcc_scan.rectify import decode_image


def corner_error(a: np.ndarray, b: np.ndarray) -> tuple[float, float]:
    """Mean and max corner distance, allowing any starting corner."""
    best = None
    for shift in range(4):
        rotated = np.roll(b, shift, axis=0)
        distances = np.linalg.norm(a - rotated, axis=1)
        candidate = (float(distances.mean()), float(distances.max()))
        if best is None or candidate[0] < best[0]:
            best = candidate
    assert best is not None
    return best


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--photos", required=True, type=Path)
    parser.add_argument("--reference", type=Path, default=None)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--csv", type=Path, default=None)
    parser.add_argument("--no-refine", action="store_true")
    args = parser.parse_args()

    references: dict[str, dict[str, object]] = {}
    if args.reference is not None:
        references = json.loads(args.reference.read_text(encoding="utf-8"))

    photos = sorted(args.photos.glob("*.jpg")) + sorted(args.photos.glob("*.png"))
    if args.limit:
        photos = photos[: args.limit]
    scorer = AlignmentScorer(IGCC_PAPER, scale=0.5)
    matcher = load_default_matcher()
    print(f"card template: {'loaded' if matcher else 'not available, contour fallback'}")

    rows: list[dict[str, object]] = []
    started = time.perf_counter()
    for path in photos:
        stem = path.stem
        data = path.read_bytes()
        image = decode_image(data)
        photo_started = time.perf_counter()
        detection = detect_card(
            image, IGCC_PAPER, refine=not args.no_refine, scorer=scorer, matcher=matcher
        )
        elapsed = time.perf_counter() - photo_started
        row: dict[str, object] = {"stem": stem, "seconds": round(elapsed, 2)}
        if detection is None:
            row.update({"decision": "no_candidate", "alignment": None, "error": None})
            rows.append(row)
            print(f"{stem} no candidate")
            continue
        row.update(
            {
                "decision": detection.decision,
                "confidence": detection.confidence,
                "alignment": detection.alignment,
                "margin": detection.margin,
                "source": detection.source,
                "candidates": detection.candidate_count,
                "aspect": detection.geometry.aspect,
                "edgeSupport": detection.geometry.edge_support,
                "sharpness": detection.quality.sharpness,
            }
        )
        reference = references.get(stem)
        if reference:
            target = np.asarray(reference["quad"], dtype=np.float32)
            mean_error, max_error = corner_error(np.asarray(detection.quad, np.float32), target)
            row["cornerError"] = round(mean_error, 1)
            row["cornerErrorMax"] = round(max_error, 1)
            row["referenceAlignment"] = round(scorer.score_quad(image, target), 4)
        rows.append(row)
        print(
            f"{stem} {detection.decision:8s} align={detection.alignment:.3f}"
            f" margin={detection.margin:.3f} source={detection.source:14s}"
            f" err={row.get('cornerError', '-')} ref={row.get('referenceAlignment', '-')}"
            f" {elapsed:.1f}s"
        )

    print()
    total = len(rows)
    print(f"photos: {total} in {time.perf_counter() - started:.0f}s")
    for decision in ("accept", "confirm", "retake", "reject", "no_candidate"):
        count = sum(1 for row in rows if row["decision"] == decision)
        if count:
            print(f"  {decision}: {count}")
    aligned = [row["alignment"] for row in rows if row.get("alignment") is not None]
    if aligned:
        print(
            f"alignment: min {min(aligned):.3f} "
            f"median {float(np.median(aligned)):.3f} max {max(aligned):.3f}"
        )
    with_error = [row for row in rows if row.get("cornerError") is not None]
    if with_error:
        errors = [float(row["cornerError"]) for row in with_error]  # type: ignore[arg-type]
        for threshold in (20, 40, 80, 150):
            good = sum(1 for value in errors if value <= threshold)
            print(f"corner error <= {threshold} px: {good}/{len(errors)}")
        print(f"median corner error: {float(np.median(errors)):.1f} px")
        accepted = [row for row in with_error if row["decision"] in {"accept", "confirm"}]
        bad = [row for row in accepted if float(row["cornerError"]) > 80]  # type: ignore[arg-type]
        print(f"accepted but misaligned (>80 px): {len(bad)}/{len(accepted)}")
        for row in bad:
            print(f"  {row['stem']} err={row['cornerError']} align={row['alignment']}")
    if args.csv is not None:
        with args.csv.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=sorted({k for row in rows for k in row}))
            writer.writeheader()
            writer.writerows(rows)
        print(f"wrote {args.csv}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
