"""Train the IGCC cell classifier and export it to ONNX.

Roboflow cannot export a classification project to ONNX. The export API answers
`HTTP 400 onnx is an invalid format for project type classification. Please use
one of: folder, clip.`, so a trained `vit` classification model cannot be
downloaded as an ONNX graph. The labelled cells themselves are exportable as a
`folder` dataset, and this script turns that export into the ONNX file the local
adapter (`igcc_scan.classify.OnnxCellClassifier`) loads.

Run from `scripts/scan`:

    python -m pip install -r requirements-train.txt
    python train_onnx.py --project lou-vincent-j-baroro-s-workspace/igcc-scorecard-digits-v2/4

The dataset downloads to `<repo>/.tmp/roboflow-dataset` unless `--dataset` points
at an existing folder export. The model is written to `models/` (ignored by Git)
together with `classes.json`, which fixes the output order.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import cv2
import numpy as np

from igcc_scan.cells import prepare_model_input

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
SPLITS = ("train", "valid", "test")


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train a cell classifier on a Roboflow folder export and export ONNX."
    )
    parser.add_argument(
        "--dataset",
        type=Path,
        default=None,
        help="Existing folder-export directory (contains train/, valid/, test/).",
    )
    parser.add_argument(
        "--project",
        default="",
        help="Roboflow project as workspace/project/version. Used to download the export.",
    )
    parser.add_argument("--api-key-env", default="ROBOFLOW_API_KEY")
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).resolve().parent / "models" / "igcc-scorecard-digits.onnx",
        help="ONNX output path. Defaults to models/igcc-scorecard-digits.onnx.",
    )
    parser.add_argument(
        "--classes-out",
        type=Path,
        default=None,
        help="classes.json output path. Defaults to classes.json beside the model.",
    )
    parser.add_argument("--size", type=int, default=64, help="Square input size. Default 64.")
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--learning-rate", type=float, default=1e-3)
    parser.add_argument("--seed", type=int, default=20261104)
    parser.add_argument(
        "--class-weights",
        choices=("balanced", "sqrt", "none"),
        default="sqrt",
        help=(
            "Inverse-frequency weighting. `balanced` can over-correct a heavy class "
            "like 5; `sqrt` is the gentler middle. Default: sqrt."
        ),
    )
    parser.add_argument("--dropout", type=float, default=0.1)
    parser.add_argument(
        "--confusion",
        action="store_true",
        help="Print the most frequent off-diagonal pairs on the validation split.",
    )
    parser.add_argument(
        "--no-augment",
        action="store_true",
        help="Disable training augmentation. Use only to reproduce a number.",
    )
    return parser.parse_args(argv)


def download_dataset(directory: Path, project: str, api_key_env: str) -> Path:
    """Fetch the folder export, or reuse one that is already on disk."""
    if (directory / "train").is_dir():
        print(f"dataset: reusing {directory}")
        return directory
    api_key = os.environ.get(api_key_env, "").strip()
    if not api_key:
        raise SystemExit(
            f"error: {api_key_env} is not set, so the export cannot be downloaded. "
            "No key is read from or written to the repository."
        )
    parts = project.strip("/").split("/")
    if len(parts) != 3:
        raise SystemExit("error: --project must be workspace/project/version.")
    workspace_slug, project_slug, version = parts
    try:
        import roboflow  # type: ignore[import-not-found]
    except ImportError:
        raise SystemExit(
            "error: the Roboflow SDK is not installed. Run: "
            "python -m pip install -r requirements-roboflow.txt"
        ) from None
    print(f"dataset: downloading {workspace_slug}/{project_slug}/{version} as folder")
    client = roboflow.Roboflow(api_key=api_key)
    dataset = client.workspace(workspace_slug).project(project_slug).version(int(version))
    dataset.download("folder", location=str(directory), overwrite=False)
    return directory


def collect_split(root: Path, split: str) -> list[tuple[Path, str]]:
    """Return (image, label) pairs. Folder names are the labels."""
    split_dir = root / split
    if not split_dir.is_dir():
        return []
    items: list[tuple[Path, str]] = []
    for class_dir in sorted(split_dir.iterdir()):
        if not class_dir.is_dir():
            continue
        for image in sorted(class_dir.iterdir()):
            if image.is_file() and image.suffix.lower() in IMAGE_SUFFIXES:
                items.append((image, class_dir.name))
    return items


def collect_classes(root: Path) -> list[str]:
    """Every label seen in any split, in a stable order."""
    labels: set[str] = set()
    for split in SPLITS:
        split_dir = root / split
        if split_dir.is_dir():
            labels.update(entry.name for entry in split_dir.iterdir() if entry.is_dir())
    if not labels:
        raise SystemExit(f"error: no class folders under {root}")
    return sorted(labels)


def read_gray(image: Path) -> np.ndarray:
    loaded = cv2.imread(str(image), cv2.IMREAD_GRAYSCALE)
    if loaded is None:
        raise SystemExit(f"error: could not read {image}")
    return loaded


def augment(gray: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Geometric and photometric jitter. Same crop contract, extra variety."""
    height, width = gray.shape[:2]
    center = (width / 2.0, height / 2.0)
    matrix = cv2.getRotationMatrix2D(
        center,
        float(rng.uniform(-7.0, 7.0)),
        float(rng.uniform(0.85, 1.12)),
    )
    matrix[0, 2] += float(rng.uniform(-0.06, 0.06) * width)
    matrix[1, 2] += float(rng.uniform(-0.06, 0.06) * height)
    warped = cv2.warpAffine(
        gray,
        matrix,
        (width, height),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=255,
    )
    alpha = float(rng.uniform(0.75, 1.25))
    beta = float(rng.uniform(-25.0, 25.0))
    shifted = np.clip(warped.astype(np.float32) * alpha + beta, 0, 255).astype(np.uint8)
    if rng.random() < 0.25:
        shifted = cv2.GaussianBlur(shifted, (3, 3), 0)
    if rng.random() < 0.20:
        kernel = np.ones((2, 2), np.uint8)
        if rng.random() < 0.5:
            shifted = cv2.erode(shifted, kernel, iterations=1)
        else:
            shifted = cv2.dilate(shifted, kernel, iterations=1)
    if rng.random() < 0.15:
        noise = rng.normal(0.0, 6.0, shifted.shape)
        shifted = np.clip(shifted.astype(np.float32) + noise, 0, 255).astype(np.uint8)
    return shifted


def build_model(size: int, class_count: int, dropout: float = 0.1):
    import torch.nn as nn

    return nn.Sequential(
        nn.Conv2d(1, 24, 3, padding=1),
        nn.BatchNorm2d(24),
        nn.ReLU(inplace=True),
        nn.MaxPool2d(2),
        nn.Conv2d(24, 48, 3, padding=1),
        nn.BatchNorm2d(48),
        nn.ReLU(inplace=True),
        nn.MaxPool2d(2),
        nn.Conv2d(48, 96, 3, padding=1),
        nn.BatchNorm2d(96),
        nn.ReLU(inplace=True),
        nn.MaxPool2d(2),
        nn.Flatten(),
        nn.Linear(96 * (size // 8) * (size // 8), 128),
        nn.ReLU(inplace=True),
        nn.Dropout(dropout),
        nn.Linear(128, class_count),
    )


class CellDataset:
    """Map (image, label) pairs to the exact tensor the service feeds the model."""

    def __init__(
        self,
        items: list[tuple[Path, str]],
        class_index: dict[str, int],
        *,
        size: int,
        augment_images: bool,
        seed: int,
    ) -> None:
        self.items = items
        self.class_index = class_index
        self.size = size
        self.augment_images = augment_images
        self.rng = np.random.default_rng(seed)

    def __len__(self) -> int:
        return len(self.items)

    def __getitem__(self, index: int):
        image, label = self.items[index]
        gray = read_gray(image)
        if self.augment_images:
            gray = augment(gray, self.rng)
        tensor = prepare_model_input(
            gray, size=self.size, channels=1, layout="nchw", normalize="unit"
        )
        return tensor[0], self.class_index[label]


def evaluate(
    model, items, class_index, size, batch_size, device, confusion: dict | None = None
) -> tuple[float, dict[str, int], dict[str, int]]:
    import torch

    dataset = CellDataset(items, class_index, size=size, augment_images=False, seed=0)
    loader = torch.utils.data.DataLoader(dataset, batch_size=batch_size, shuffle=False)
    correct = 0
    total = 0
    per_class: dict[str, list[int]] = {label: [0, 0] for label in class_index}
    labels = list(class_index)
    model.eval()
    with torch.no_grad():
        for inputs, targets in loader:
            logits = model(inputs.to(device))
            predictions = logits.argmax(dim=1).cpu()
            for prediction, target in zip(predictions.tolist(), targets.tolist()):
                name = labels[target]
                per_class[name][1] += 1
                if confusion is not None and prediction != target:
                    key = (name, labels[prediction])
                    confusion[key] = confusion.get(key, 0) + 1
                if prediction == target:
                    per_class[name][0] += 1
                    correct += 1
                total += 1
    return (correct / total if total else 0.0), {
        name: values[0] for name, values in per_class.items() if values[1]
    }, {name: values[1] for name, values in per_class.items() if values[1]}


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    import torch
    import torch.nn.functional as functional

    dataset_root = args.dataset
    if dataset_root is None:
        directory = repo_root() / ".tmp" / "roboflow-dataset"
        dataset_root = download_dataset(directory, args.project, args.api_key_env)

    classes = collect_classes(dataset_root)
    class_index = {label: index for index, label in enumerate(classes)}
    train_items = collect_split(dataset_root, "train")
    val_items = collect_split(dataset_root, "valid") or collect_split(dataset_root, "test")
    test_items = collect_split(dataset_root, "test")
    if not train_items:
        raise SystemExit(f"error: no training images under {dataset_root / 'train'}")
    if not val_items:
        raise SystemExit(f"error: no validation images under {dataset_root / 'valid'}")
    known = {label for label in classes}
    for name, items in (("train", train_items), ("valid", val_items)):
        unknown = sorted({label for _, label in items} - known)
        if unknown:
            raise SystemExit(f"error: {name} has labels with no class folder: {unknown}")
    print(f"classes: {classes}")
    print(f"train: {len(train_items)}  valid: {len(val_items)}  test: {len(test_items)}")

    torch.manual_seed(args.seed)
    np.random.seed(args.seed)
    device = torch.device("cpu")
    model = build_model(args.size, len(classes), args.dropout).to(device)
    counts = np.zeros(len(classes), dtype=np.float64)
    for _, label in train_items:
        counts[class_index[label]] += 1
    # Cell datasets are imbalanced (5s and 6s dominate). Weight the rare classes
    # so a blank or a 9 is not drowned out, without inventing samples.
    if args.class_weights == "none":
        weights = np.ones(len(classes), dtype=np.float64)
    else:
        weights = np.where(
            counts > 0, counts.sum() / (len(classes) * np.maximum(counts, 1)), 0.0
        )
        if args.class_weights == "sqrt":
            weights = np.sqrt(weights)
    loss_weights = torch.tensor(weights, dtype=torch.float32, device=device)
    criterion = functional.cross_entropy

    train_dataset = CellDataset(
        train_items,
        class_index,
        size=args.size,
        augment_images=not args.no_augment,
        seed=args.seed,
    )
    loader = torch.utils.data.DataLoader(
        train_dataset, batch_size=args.batch_size, shuffle=True
    )
    optimizer = torch.optim.Adam(model.parameters(), lr=args.learning_rate)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)

    best_accuracy = -1.0
    best_state = None
    for epoch in range(1, args.epochs + 1):
        model.train()
        running = 0.0
        seen = 0
        for inputs, targets in loader:
            inputs = inputs.to(device)
            targets = targets.to(device)
            optimizer.zero_grad()
            logits = model(inputs)
            loss = criterion(logits, targets, weight=loss_weights)
            loss.backward()
            optimizer.step()
            running += float(loss.item()) * inputs.shape[0]
            seen += inputs.shape[0]
        scheduler.step()
        accuracy, _correct, _total = evaluate(
            model, val_items, class_index, args.size, args.batch_size, device
        )
        print(f"epoch {epoch:02d}  loss {running / max(seen, 1):.4f}  valid {accuracy:.4f}")
        if accuracy > best_accuracy:
            best_accuracy = accuracy
            best_state = {k: v.detach().clone() for k, v in model.state_dict().items()}

    if best_state is not None:
        model.load_state_dict(best_state)
    model.eval()

    confusion: dict[tuple[str, str], int] = {}
    correct, totals = evaluate(
        model, val_items, class_index, args.size, args.batch_size, device, confusion
    )[1:]
    print(f"best valid accuracy: {best_accuracy:.4f}")
    for label in classes:
        if label in totals:
            print(f"  {label:>10}: {correct.get(label, 0)}/{totals[label]}")
    if args.confusion and confusion:
        ranked = sorted(confusion.items(), key=lambda item: -item[1])[:15]
        print("most frequent mistakes (true -> predicted):")
        for (actual, predicted), count in ranked:
            print(f"  {actual:>10} -> {predicted:<10} {count}")
    if test_items:
        test_accuracy = evaluate(
            model, test_items, class_index, args.size, args.batch_size, device
        )[0]
        print(f"test accuracy: {test_accuracy:.4f}")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    dummy = torch.zeros(1, 1, args.size, args.size, dtype=torch.float32)
    try:
        torch.onnx.export(
            model,
            dummy,
            str(args.out),
            input_names=["cell"],
            output_names=["scores"],
            opset_version=17,
            dynamo=False,
        )
    except TypeError:
        torch.onnx.export(
            model,
            dummy,
            str(args.out),
            input_names=["cell"],
            output_names=["scores"],
            opset_version=17,
        )
    classes_out = args.classes_out or args.out.with_name("classes.json")
    classes_out.write_text(json.dumps(classes, indent=2) + "\n", encoding="utf-8")
    print(f"model: {args.out}")
    print(f"classes: {classes_out}")

    # Prove the export loads and runs through the same adapter the service uses.
    from igcc_scan.classify import OnnxCellClassifier

    classifier = OnnxCellClassifier(
        args.out,
        classes_out,
        input_size=args.size,
        input_channels=1,
        input_layout="nchw",
        input_normalize="unit",
        confidence_threshold=0.0,
        engine="igcc-cell-classifier",
        version=str(best_accuracy),
    )
    agree = 0
    checked = 0
    for image, label in val_items:
        prediction = classifier.classify(read_gray(image))
        agree += int(prediction.label == label)
        checked += 1
    print(f"onnxruntime agreement on valid: {agree}/{checked}")
    if checked and agree / checked + 1e-6 < best_accuracy:
        print("warning: the ONNX export scores lower than the trained model.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
