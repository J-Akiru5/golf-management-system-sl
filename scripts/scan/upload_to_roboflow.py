"""Upload a labelled bootstrap classification folder to Roboflow.

The script refuses to upload a manifest whose `trainable` flag is false unless
`--allow-bootstrap` is given. That flag exists to test the upload/inference path,
not to justify training a production model on one card.

No API key is stored here. Pass it through `ROBOFLOW_API_KEY` (or the env var named
by `--api-key-env`). The upload call is based on the documented
`Workspace.upload_dataset()` API; it has not been exercised in this worktree
because no key was available.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Upload the labelled IGCC bootstrap cells to Roboflow."
    )
    parser.add_argument(
        "--dataset",
        type=Path,
        required=True,
        help="Dataset output directory containing manifest.json and roboflow/train.",
    )
    parser.add_argument("--workspace", default="", help="Roboflow workspace slug.")
    parser.add_argument("--project", default="", help="Roboflow project id (created if missing).")
    parser.add_argument("--batch-name", default="igcc-bootstrap-one-card")
    parser.add_argument("--api-key-env", default="ROBOFLOW_API_KEY")
    parser.add_argument(
        "--allow-bootstrap",
        action="store_true",
        help="Allow uploading a manifest marked trainable=false. For pipeline tests only.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be uploaded; no key, network or SDK needed.",
    )
    return parser.parse_args(argv)


def count_images(root: Path) -> dict[str, int]:
    counts: dict[str, int] = {}
    train = root / "roboflow" / "train"
    if not train.is_dir():
        return counts
    for class_dir in sorted(train.iterdir()):
        if not class_dir.is_dir():
            continue
        images = [
            item
            for item in class_dir.iterdir()
            if item.is_file() and item.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}
        ]
        if images:
            counts[class_dir.name] = len(images)
    return counts


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    manifest_path = args.dataset / "manifest.json"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except OSError:
        print(f"error: no manifest at {manifest_path}", file=sys.stderr)
        return 1
    except json.JSONDecodeError as exc:
        print(f"error: invalid manifest: {exc}", file=sys.stderr)
        return 1
    counts = count_images(args.dataset)
    total = sum(counts.values())
    print(f"dataset: {args.dataset.resolve()}")
    print(f"manifest trainable: {manifest.get('trainable')}")
    print(f"classes: {json.dumps(counts, sort_keys=True)}")
    print(f"images: {total}")
    if not total:
        print(
            "error: roboflow/train has no labelled images. Fill labels.template.json, "
            "rerun prepare_dataset.py with --labels, then upload.",
            file=sys.stderr,
        )
        return 1
    if manifest.get("trainable") is not True and not args.allow_bootstrap:
        print(
            "error: this manifest is bootstrap data (trainable=false). "
            "Pass --allow-bootstrap only to test the upload path, not to train a production model.",
            file=sys.stderr,
        )
        return 1
    if args.dry_run:
        print("dry run: no API key read, no network call, no upload.")
        if not args.workspace or not args.project:
            print("note: a real upload also needs --workspace and --project.")
        return 0
    if not args.workspace or not args.project:
        print("error: --workspace and --project are required for a real upload.", file=sys.stderr)
        return 1
    api_key = os.environ.get(args.api_key_env, "").strip()
    if not api_key:
        print(
            f"error: {args.api_key_env} is not set. The upload was not attempted and no key was stored.",
            file=sys.stderr,
        )
        return 2
    try:
        import roboflow  # type: ignore[import-not-found]
    except ImportError:
        print(
            "error: the Roboflow SDK is not installed. Run: "
            "python -m pip install -r requirements-roboflow.txt",
            file=sys.stderr,
        )
        return 2
    print("warning: uploading bootstrap data from one physical card. Do not report accuracy from it.")
    try:
        client = roboflow.Roboflow(api_key=api_key)
        workspace = client.workspace(args.workspace)
        workspace.upload_dataset(
            str((args.dataset / "roboflow").resolve()),
            args.project,
            num_workers=4,
            project_license="Private",
            project_type="classification",
            batch_name=args.batch_name,
            num_retries=2,
        )
    except Exception as exc:  # noqa: BLE001 - CLI boundary
        print(f"error: Roboflow upload failed: {exc}", file=sys.stderr)
        return 1
    print("upload submitted. Open Roboflow and confirm the class folders before training.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
