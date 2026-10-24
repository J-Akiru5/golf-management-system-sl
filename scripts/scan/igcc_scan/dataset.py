"""Build a bootstrap dataset from the one available filled card.

This script does **not** create a trainable dataset. One physical card yields 72
cells across four printed player rows; two rows contain handwriting. Synthetic
variants are correlated copies of those same cells. The output is for checking the
crop geometry, the masking, the Roboflow upload format and later local inference.
Accuracy measured on it would be meaningless.

Human labels are optional. Without them every manifest record says
`labelStatus: "missing"` and no Roboflow classification folders are written. The
script never derives labels from its own predictions.
"""

from __future__ import annotations

import hashlib
import json
import random
import zipfile
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from .cells import crop_cells, draw_template_overlay
from .geometry import IGCC_PAPER, CardTemplate
from .rectify import decode_image, rectify_card, rotate_image

SCHEMA_MANIFEST = "igcc.scorecard.dataset/1"
SCHEMA_RECORD = "igcc.scorecard.cell/1"


@dataclass(frozen=True)
class Calibration:
    source: str
    rotation_degrees: int
    corners: tuple[tuple[float, float], ...]
    source_sha256: str | None = None
    source_size: tuple[int, int] | None = None
    rotated_size: tuple[int, int] | None = None


def load_calibration(path: Path) -> Calibration:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise ValueError(f"Could not read the calibration file: {path}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"The calibration file is not valid JSON: {path}") from exc
    if not isinstance(data, dict):
        raise TypeError("The calibration file must contain a JSON object.")
    corners = data.get("corners")
    if not isinstance(corners, list) or len(corners) != 4:
        raise ValueError("Calibration 'corners' must be four [x, y] points (TL TR BR BL).")
    points = tuple((float(point[0]), float(point[1])) for point in corners)
    rotation = int(data.get("rotationDegrees", 0))
    if rotation % 360 not in {0, 90, 180, 270}:
        raise ValueError("Calibration 'rotationDegrees' must be 0, 90, 180 or 270.")
    source_size = data.get("sourceSize")
    rotated_size = data.get("rotatedSize")
    return Calibration(
        source=str(data.get("source") or path.stem),
        rotation_degrees=rotation % 360,
        corners=points,
        source_sha256=data.get("sourceSha256"),
        source_size=tuple(source_size) if source_size else None,
        rotated_size=tuple(rotated_size) if rotated_size else None,
    )


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _parse_label(value: Any) -> tuple[str, int | None]:
    if value is None:
        return "missing", None
    if isinstance(value, bool):
        raise TypeError("A score label cannot be true/false.")
    if isinstance(value, int):
        if not 1 <= value <= 20:
            raise ValueError(f"Score label {value} is outside 1..20.")
        return "human", value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"", "blank", "empty", "none"}:
            return "blank", None
        if normalized in {"unreadable", "unknown"}:
            return "unreadable", None
        if normalized.isdigit():
            number = int(normalized)
            if 1 <= number <= 20:
                return "human", number
        raise ValueError(f"Unknown label value: {value!r}")
    raise ValueError(f"Unsupported label value: {value!r}")


def load_labels(path: Path, source_sha256: str) -> dict[tuple[int, int], tuple[str, int | None]]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise ValueError(f"Could not read the labels file: {path}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"The labels file is not valid JSON: {path}") from exc
    if not isinstance(data, dict):
        raise TypeError("The labels file must contain a JSON object.")
    expected_hash = data.get("sourceSha256")
    if expected_hash and expected_hash != source_sha256:
        raise ValueError(
            "The labels file belongs to a different source image "
            f"(labels {expected_hash[:12]}..., image {source_sha256[:12]}...)."
        )
    labels: dict[tuple[int, int], tuple[str, int | None]] = {}
    rows = data.get("rows")
    cells = data.get("cells")
    if isinstance(rows, dict):
        for row_key, row_value in rows.items():
            if not isinstance(row_value, dict):
                raise TypeError(f"Labels for row {row_key} must be an object.")
            row_index = int(row_key)
            for hole_key, label_value in row_value.items():
                labels[(row_index, int(hole_key))] = _parse_label(label_value)
    elif isinstance(cells, list):
        for item in cells:
            if not isinstance(item, dict):
                raise TypeError("Each entry in 'cells' must be an object.")
            labels[(int(item["rowIndex"]), int(item["hole"]))] = _parse_label(
                item.get("label")
            )
    else:
        raise TypeError("The labels file needs a 'rows' object or a 'cells' list.")
    for row_index, hole in labels:
        if not 0 <= row_index < len(IGCC_PAPER.player_rows) or not 1 <= hole <= 18:
            raise ValueError(f"Label cell ({row_index}, {hole}) is outside the template.")
    return labels


def _write_labels_template(path: Path, source_sha256: str) -> None:
    if path.exists():
        return
    rows = {
        str(row): {str(hole): None for hole in range(1, 19)}
        for row in range(len(IGCC_PAPER.player_rows))
    }
    payload = {
        "sourceSha256": source_sha256,
        "note": (
            "Fill in only digits you can read from the source photo. Use an integer 1..20, "
            "'blank' for a cell with no handwriting, or 'unreadable' when a mark cannot be "
            "read. Leave null for not labelled. Do not guess."
        ),
        "rows": rows,
    }
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _augment(cell: np.ndarray, rng: random.Random, count: int) -> list[tuple[int, np.ndarray, dict[str, float]]]:
    variants: list[tuple[int, np.ndarray, dict[str, float]]] = []
    for index in range(1, count + 1):
        angle = rng.uniform(-4.0, 4.0)
        scale = rng.uniform(0.96, 1.04)
        dx = rng.uniform(-2.0, 2.0)
        dy = rng.uniform(-2.0, 2.0)
        contrast = rng.uniform(0.90, 1.10)
        brightness = rng.uniform(-18.0, 18.0)
        center = (cell.shape[1] / 2.0, cell.shape[0] / 2.0)
        matrix = cv2.getRotationMatrix2D(center, angle, scale)
        matrix[0, 2] += dx
        matrix[1, 2] += dy
        variant = cv2.warpAffine(
            cell,
            matrix,
            (cell.shape[1], cell.shape[0]),
            flags=cv2.INTER_LINEAR,
            borderMode=cv2.BORDER_CONSTANT,
            borderValue=(255, 255, 255),
        )
        variant = cv2.convertScaleAbs(variant, alpha=contrast, beta=brightness)
        blur = 0.0
        if rng.random() < 0.30:
            variant = cv2.GaussianBlur(variant, (3, 3), 0)
            blur = 1.0
        variants.append(
            (
                index,
                variant,
                {
                    "angle": round(angle, 3),
                    "scale": round(scale, 4),
                    "dx": round(dx, 3),
                    "dy": round(dy, 3),
                    "contrast": round(contrast, 4),
                    "brightness": round(brightness, 3),
                    "blur3": blur,
                },
            )
        )
    return variants


def _write_zip(root: Path, destination: Path, include: list[str]) -> None:
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for relative in include:
            path = root / relative
            if path.is_file():
                archive.write(path, relative)
            elif path.is_dir():
                for child in sorted(path.rglob("*")):
                    if child.is_file():
                        archive.write(child, child.relative_to(root).as_posix())


def prepare_dataset(
    *,
    image_path: Path,
    out_dir: Path,
    calibration: Calibration,
    template: CardTemplate = IGCC_PAPER,
    labels_path: Path | None = None,
    augment_count: int = 2,
    seed: int = 20261024,
    make_zip: bool = False,
    allow_source_mismatch: bool = False,
    mask_dots: bool = False,
) -> dict[str, Any]:
    if augment_count < 0 or augment_count > 20:
        raise ValueError("augment_count must be between 0 and 20.")
    out_dir = out_dir.resolve()
    if out_dir == Path(out_dir.anchor):
        raise ValueError("Refusing to write a dataset to a filesystem root.")
    out_dir.mkdir(parents=True, exist_ok=True)
    crops_dir = out_dir / "crops"
    masked_dir = out_dir / "masked"
    augmented_dir = out_dir / "augmented"
    for directory in (crops_dir, masked_dir, augmented_dir):
        directory.mkdir(parents=True, exist_ok=True)

    raw = image_path.read_bytes()
    source_hash = sha256_bytes(raw)
    if (
        calibration.source_sha256
        and calibration.source_sha256 != source_hash
        and not allow_source_mismatch
    ):
        raise ValueError(
            "The calibration was measured on a different image. "
            "Re-measure the corners or pass --allow-source-mismatch for a deliberate test."
        )
    image = decode_image(raw)
    if calibration.source_size and (image.shape[1], image.shape[0]) != calibration.source_size:
        raise ValueError(
            "The source image size does not match the calibration "
            f"({image.shape[1]}x{image.shape[0]} vs {calibration.source_size[0]}x"
            f"{calibration.source_size[1]})."
        )
    rotated = rotate_image(image, calibration.rotation_degrees)
    if calibration.rotated_size and (
        rotated.shape[1],
        rotated.shape[0],
    ) != calibration.rotated_size:
        raise ValueError(
            "The rotated image size does not match the calibration "
            f"({rotated.shape[1]}x{rotated.shape[0]} vs {calibration.rotated_size[0]}x"
            f"{calibration.rotated_size[1]})."
        )

    rectified = rectify_card(
        rotated,
        template,
        corners=calibration.corners,
        forced_rotation=0,
        debug_dir=None,
    )
    cv2.imwrite(str(out_dir / "card_rectified.png"), rectified.image)
    cv2.imwrite(
        str(out_dir / "card_cells_overlay.png"),
        draw_template_overlay(rectified.image, template),
    )

    labels: dict[tuple[int, int], tuple[str, int | None]] = {}
    if labels_path is not None:
        labels = load_labels(labels_path, source_hash)
    _write_labels_template(out_dir / "labels.template.json", source_hash)

    rows = len(template.player_rows)
    labels_dir = out_dir / "roboflow" / "train"
    records: list[dict[str, Any]] = []
    counts = {
        "physicalCards": 1,
        "rows": rows,
        "cells": 0,
        "crops": 0,
        "maskedCrops": 0,
        "augmentations": 0,
        "labelled": 0,
        "blank": 0,
        "unreadable": 0,
        "missing": 0,
        "roboflowImages": 0,
    }
    class_counts: dict[str, int] = {}
    rng = random.Random(seed)

    for cell in crop_cells(rectified.image, template, mask_dots=mask_dots):
        counts["cells"] += 1
        base = f"row{cell.row_index}_hole{cell.hole:02d}"
        crop_relative = f"crops/{base}.png"
        masked_relative = f"masked/{base}.png"
        cv2.imwrite(str(out_dir / crop_relative), cell.image)
        cv2.imwrite(str(out_dir / masked_relative), cell.masked)
        counts["crops"] += 1
        counts["maskedCrops"] += 1

        status, label = labels.get(
            (cell.row_index, cell.hole), ("missing", None)
        )
        if status == "human":
            counts["labelled"] += 1
        else:
            counts[status] += 1
        record = {
            "schema": SCHEMA_RECORD,
            "kind": "crop",
            "synthetic": False,
            "parent": None,
            "image": crop_relative,
            "maskedImage": masked_relative,
            "rowIndex": cell.row_index,
            "hole": cell.hole,
            "box": cell.box.to_list(),
            "removedDots": cell.removed_dots,
            "label": label if status == "human" else None,
            "labelStatus": status,
            "source": calibration.source,
            "sourceSha256": source_hash,
            "template": template.template_id,
            "templateVersion": template.version,
            "augmentation": None,
        }
        records.append(record)

        if status == "human" and label is not None:
            class_name = str(label)
            destination = labels_dir / class_name
            destination.mkdir(parents=True, exist_ok=True)
            target = destination / f"{base}.png"
            cv2.imwrite(str(target), cell.masked)
            counts["roboflowImages"] += 1
            class_counts[class_name] = class_counts.get(class_name, 0) + 1
        elif status == "blank":
            destination = labels_dir / "blank"
            destination.mkdir(parents=True, exist_ok=True)
            target = destination / f"{base}.png"
            cv2.imwrite(str(target), cell.masked)
            counts["roboflowImages"] += 1
            class_counts["blank"] = class_counts.get("blank", 0) + 1
        elif status == "unreadable":
            destination = labels_dir / "unreadable"
            destination.mkdir(parents=True, exist_ok=True)
            target = destination / f"{base}.png"
            cv2.imwrite(str(target), cell.masked)
            counts["roboflowImages"] += 1
            class_counts["unreadable"] = class_counts.get("unreadable", 0) + 1

        for index, variant, parameters in _augment(cell.masked, rng, augment_count):
            augmented_relative = f"augmented/{base}_a{index}.png"
            cv2.imwrite(str(out_dir / augmented_relative), variant)
            counts["augmentations"] += 1
            records.append(
                {
                    "schema": SCHEMA_RECORD,
                    "kind": "synthetic_augmentation",
                    "synthetic": True,
                    "parent": crop_relative,
                    "image": augmented_relative,
                    "maskedImage": augmented_relative,
                    "rowIndex": cell.row_index,
                    "hole": cell.hole,
                    "box": cell.box.to_list(),
                    "removedDots": cell.removed_dots,
                    "label": label if status == "human" else None,
                    "labelStatus": status,
                    "source": calibration.source,
                    "sourceSha256": source_hash,
                    "template": template.template_id,
                    "templateVersion": template.version,
                    "augmentation": parameters,
                }
            )

    labels_supplied = labels_path is not None and counts["labelled"] + counts["blank"] + counts["unreadable"] > 0
    trainable = False
    reason = (
        "One physical card was available. All augmentations derive from the same card, so they "
        "are not independent samples and a validation split would leak. Use this dataset only to "
        "check cropping, masking, upload format and the inference path."
    )
    warnings = [
        "Bootstrap data only; do not report model accuracy from this dataset.",
        "No validation or test split was created, because every cell comes from one card.",
        "Synthetic augmentations are correlated copies, not new handwriting examples.",
    ]
    if not labels_supplied:
        warnings.append(
            "No human cell labels were supplied, so no Roboflow classification images were written. "
            "Fill labels.template.json and rerun with --labels."
        )
    if counts["missing"]:
        warnings.append(
            f"{counts['missing']} cell(s) have no label; they are excluded from the Roboflow folder."
        )
    if counts["roboflowImages"] == 0:
        warnings.append(
            "The Roboflow folder has no images yet. The manifest still records every crop."
        )

    manifest = {
        "schema": SCHEMA_MANIFEST,
        "createdUtc": datetime.now(UTC).isoformat(),
        "datasetKind": "bootstrap-single-card",
        "trainable": trainable,
        "trainableReason": reason,
        "source": {
            "name": calibration.source,
            "sha256": source_hash,
            "size": [int(image.shape[1]), int(image.shape[0])],
            "rotationDegrees": calibration.rotation_degrees,
            "corners": [list(point) for point in calibration.corners],
            "rotatedSize": [int(rotated.shape[1]), int(rotated.shape[0])],
        },
        "template": {
            "id": template.template_id,
            "version": template.version,
            "width": template.width,
            "height": template.height,
            "playerRows": [list(row) for row in template.player_rows],
            "holeColumns": [list(column) for column in template.hole_columns],
            "dotSearchRegion": list(template.dot_search_region),
            "dotMaskEnabled": mask_dots,
        },
        "labels": {
            "supplied": labels_supplied,
            "templateFile": "labels.template.json",
            "classCounts": dict(sorted(class_counts.items())),
        },
        "counts": counts,
        "warnings": warnings,
        "recordsFile": "manifest.jsonl",
        "note": (
            "One filled IGCC card (four printed player rows, two handwritten). "
            "This is bootstrap data, not a trainable dataset."
        ),
    }
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    with (out_dir / "manifest.jsonl").open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")

    readme = _dataset_readme(manifest)
    (out_dir / "README.md").write_text(readme, encoding="utf-8")
    (out_dir / "roboflow").mkdir(parents=True, exist_ok=True)
    (out_dir / "roboflow" / "README.md").write_text(
        _roboflow_readme(manifest, labels_supplied), encoding="utf-8"
    )

    if make_zip:
        _write_zip(
            out_dir,
            out_dir / "bootstrap_crops.zip",
            ["crops", "masked", "augmented", "manifest.json", "manifest.jsonl", "README.md"],
        )
        if counts["roboflowImages"]:
            _write_zip(out_dir, out_dir / "roboflow_bootstrap.zip", ["roboflow"])

    return manifest


def _dataset_readme(manifest: dict[str, Any]) -> str:
    counts = manifest["counts"]
    warnings = "\n".join(f"- {warning}" for warning in manifest["warnings"])
    return f"""# IGCC scorecard bootstrapping dataset

**Not a training set.** One physical card produced {counts["cells"]} cells
({counts["augmentations"]} synthetic variants). The augmentations are correlated
copies, so they cannot stand in for more cards.

- Source: `{manifest["source"]["name"]}`
- Source SHA-256: `{manifest["source"]["sha256"]}`
- Template: `{manifest["template"]["id"]}` / `{manifest["template"]["version"]}`
- Cells: {counts["cells"]}
- Labelled (human): {counts["labelled"]}
- Explicit blank: {counts["blank"]}
- Unreadable: {counts["unreadable"]}
- Missing: {counts["missing"]}
- Synthetic augmentations: {counts["augmentations"]}
- Roboflow images: {counts["roboflowImages"]}

## Files

- `card_rectified.png` - the card after perspective correction.
- `card_cells_overlay.png` - every score cell and printed-dot window.
- `crops/` - raw cell crops.
- `masked/` - crops after the optional printed-dot mask. On this card the mask is
  off, so this folder is a copy of `crops/`; use it for training either way.
- `augmented/` - synthetic variants; bootstrap only.
- `manifest.json` / `manifest.jsonl` - source hash, boxes, labels, augmentation parameters.
- `labels.template.json` - fill in readable digits, `blank` or `unreadable`, then rerun
  `prepare_dataset.py --labels labels.template.json`.
- `roboflow/` - classification folder layout (only populated for labelled cells).

## Warnings

{warnings}

## Next

1. Check `card_cells_overlay.png` before trusting a crop.
2. A human labels the cells. Do not use model output as ground truth.
3. Collect more cards, split by card, and only then consider training.
"""


def _roboflow_readme(manifest: dict[str, Any], labels_supplied: bool) -> str:
    counts = manifest["counts"]
    if not labels_supplied:
        return """# Roboflow folder

No human labels were supplied, so this folder has no classification images yet.

Fill `../labels.template.json`, then rerun from `scripts/scan`:

```powershell
python prepare_dataset.py --image "<photo>" --out "<this dataset directory>" `
  --labels "<this dataset directory>\\labels.template.json"
```

This bootstrap upload is for testing the pipeline, not for measuring accuracy.
"""
    return f"""# Roboflow bootstrap upload

This folder uses the classification layout: `train/<class>/<image>.png`.

Classes: {", ".join(sorted(manifest["labels"]["classCounts"])) or "none"}.

Images: {counts["roboflowImages"]}. These come from one card and are **not** a
trainable dataset. There is deliberately no validation split.

Dry run the uploader first:

```powershell
python upload_to_roboflow.py --dataset "<this dataset directory>" --dry-run --allow-bootstrap
```

Then set `ROBOFLOW_API_KEY` and run with `--workspace`, `--project` and
`--allow-bootstrap`. Uploading needs the Roboflow key; the scaffold never stores it.
"""
