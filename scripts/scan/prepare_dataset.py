"""Prepare bootstrap cell crops from the one available filled IGCC card.

Run from `scripts/scan`:

    python prepare_dataset.py \
        --image "C:\\Users\\Lenovo\\Downloads\\golf score Sheet.jpg"

Output defaults to `<repo>/.tmp/scan-dataset`, which is ignored by Git.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from igcc_scan.dataset import load_calibration, prepare_dataset


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Crop the IGCC card into bootstrap cells. Not a training pipeline.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--image", required=True, type=Path, help="Path to the filled card photo.")
    parser.add_argument(
        "--calibration",
        type=Path,
        default=Path(__file__).resolve().parent / "igcc_photo_calibration.json",
        help="Card corner calibration JSON. Defaults to the measured one-card calibration.",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=repo_root() / ".tmp" / "scan-dataset",
        help="Output directory. Defaults to <repo>/.tmp/scan-dataset (ignored by Git).",
    )
    parser.add_argument(
        "--labels",
        type=Path,
        default=None,
        help="Optional human labels JSON. Without it every cell is marked missing.",
    )
    parser.add_argument(
        "--augment",
        type=int,
        default=2,
        help="Synthetic variants per cell (0-20). These are bootstrap only. Default: 2.",
    )
    parser.add_argument("--seed", type=int, default=20261024)
    parser.add_argument(
        "--mask-dots",
        action="store_true",
        help=(
            "Enable the printed-dot mask. Off for the IGCC card, which prints "
            "stroke indexes in a separate row."
        ),
    )
    parser.add_argument(
        "--zip",
        action="store_true",
        help="Also write bootstrap_crops.zip and, when labelled, roboflow_bootstrap.zip.",
    )
    parser.add_argument(
        "--allow-source-mismatch",
        action="store_true",
        help="Use the calibration even when the source SHA-256 differs. Testing only.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        calibration = load_calibration(args.calibration)
        manifest = prepare_dataset(
            image_path=args.image,
            out_dir=args.out,
            calibration=calibration,
            labels_path=args.labels,
            augment_count=args.augment,
            seed=args.seed,
            make_zip=args.zip,
            allow_source_mismatch=args.allow_source_mismatch,
            mask_dots=args.mask_dots,
        )
    except Exception as exc:  # noqa: BLE001 - CLI boundary
        print(f"error: {exc}", file=sys.stderr)
        return 1
    print(json.dumps({key: manifest[key] for key in ("datasetKind", "trainable", "counts", "warnings")}, indent=2))
    print(f"output: {args.out.resolve()}")
    print("Reminder: this is bootstrap data from one card, not a trainable dataset.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
