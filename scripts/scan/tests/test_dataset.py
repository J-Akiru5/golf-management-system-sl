import json

import cv2
import pytest
from synthetic import make_photo

from igcc_scan.dataset import (
    Calibration,
    load_calibration,
    load_labels,
    prepare_dataset,
    sha256_bytes,
)


def make_inputs(tmp_path):
    photo, corners = make_photo()
    image_path = tmp_path / "synthetic card.png"
    cv2.imwrite(str(image_path), photo)
    calibration = Calibration(
        source=image_path.name,
        rotation_degrees=0,
        corners=corners,
        source_sha256=sha256_bytes(image_path.read_bytes()),
        source_size=(photo.shape[1], photo.shape[0]),
        rotated_size=(photo.shape[1], photo.shape[0]),
    )
    return image_path, calibration


def test_prepare_dataset_from_one_synthetic_card(tmp_path):
    image_path, calibration = make_inputs(tmp_path)
    out = tmp_path / "out"
    manifest = prepare_dataset(
        image_path=image_path,
        out_dir=out,
        calibration=calibration,
        augment_count=1,
        make_zip=True,
    )
    assert manifest["datasetKind"] == "bootstrap-single-card"
    assert manifest["trainable"] is False
    assert manifest["counts"]["cells"] == 72
    assert manifest["counts"]["crops"] == 72
    assert manifest["counts"]["augmentations"] == 72
    assert manifest["counts"]["missing"] == 72
    assert manifest["counts"]["roboflowImages"] == 0
    assert (out / "card_rectified.png").is_file()
    assert (out / "card_cells_overlay.png").is_file()
    assert (out / "manifest.json").is_file()
    assert (out / "manifest.jsonl").is_file()
    assert (out / "bootstrap_crops.zip").is_file()
    assert (out / "roboflow" / "README.md").is_file()
    assert not (out / "roboflow" / "train").exists()
    records = [
        json.loads(line)
        for line in (out / "manifest.jsonl").read_text(encoding="utf-8").splitlines()
    ]
    assert len(records) == 72 + 72
    assert all(record["labelStatus"] == "missing" for record in records)
    assert all(record["label"] is None for record in records)
    assert all(record["sourceSha256"] == calibration.source_sha256 for record in records)
    assert any(record["synthetic"] is True for record in records)

    labels_template = json.loads((out / "labels.template.json").read_text(encoding="utf-8"))
    assert labels_template["sourceSha256"] == calibration.source_sha256
    assert labels_template["rows"]["1"]["1"] is None


def test_human_labels_create_a_classification_folder(tmp_path):
    image_path, calibration = make_inputs(tmp_path)
    labels_path = tmp_path / "labels.json"
    labels_path.write_text(
        json.dumps(
            {
                "sourceSha256": calibration.source_sha256,
                "rows": {"1": {"1": 8, "2": 5}, "2": {"1": "blank"}, "3": {"1": 6}},
            }
        ),
        encoding="utf-8",
    )
    out = tmp_path / "out-labelled"
    manifest = prepare_dataset(
        image_path=image_path,
        out_dir=out,
        calibration=calibration,
        labels_path=labels_path,
        augment_count=0,
    )
    assert manifest["labels"]["supplied"] is True
    assert manifest["counts"]["labelled"] == 3
    assert manifest["counts"]["blank"] == 1
    assert manifest["counts"]["roboflowImages"] == 4
    assert (out / "roboflow" / "train" / "8").is_dir()
    assert (out / "roboflow" / "train" / "5").is_dir()
    assert (out / "roboflow" / "train" / "blank").is_dir()


def test_labels_reject_a_different_source(tmp_path):
    _, calibration = make_inputs(tmp_path)
    labels_path = tmp_path / "labels.json"
    labels_path.write_text(
        json.dumps({"sourceSha256": "0" * 64, "rows": {"1": {"1": 8}}}),
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="different source image"):
        load_labels(labels_path, calibration.source_sha256)


def test_load_labels_accepts_cells_list(tmp_path):
    labels_path = tmp_path / "labels.json"
    labels_path.write_text(
        json.dumps({"cells": [{"rowIndex": 1, "hole": 1, "label": "unreadable"}]}),
        encoding="utf-8",
    )
    labels = load_labels(labels_path, "abc")
    assert labels == {(1, 1): ("unreadable", None)}


def test_load_calibration_round_trip(tmp_path):
    path = tmp_path / "calibration.json"
    path.write_text(
        json.dumps(
            {
                "source": "card.jpg",
                "rotationDegrees": 90,
                "sourceSize": [1152, 2048],
                "rotatedSize": [2048, 1152],
                "corners": [[1, 2], [3, 4], [5, 6], [7, 8]],
            }
        ),
        encoding="utf-8",
    )
    calibration = load_calibration(path)
    assert calibration.rotation_degrees == 90
    assert calibration.corners == ((1.0, 2.0), (3.0, 4.0), (5.0, 6.0), (7.0, 8.0))


def test_source_hash_mismatch_is_refused_unless_allowed(tmp_path):
    image_path, calibration = make_inputs(tmp_path)
    wrong = Calibration(
        source="other.jpg",
        rotation_degrees=0,
        corners=calibration.corners,
        source_sha256="f" * 64,
    )
    with pytest.raises(ValueError, match="different image"):
        prepare_dataset(image_path=image_path, out_dir=tmp_path / "x", calibration=wrong)
    manifest = prepare_dataset(
        image_path=image_path,
        out_dir=tmp_path / "y",
        calibration=wrong,
        augment_count=0,
        allow_source_mismatch=True,
    )
    assert manifest["counts"]["cells"] == 72
