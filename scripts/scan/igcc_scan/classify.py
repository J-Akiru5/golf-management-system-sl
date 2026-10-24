"""Model adapters.

Two backends are supported:

* `local_onnx` - a classification model exported from Roboflow and run locally
  with ONNX Runtime. This is the intended production path: no per-cell network
  calls, no image leaves the host.
* `roboflow_hosted` - the Roboflow Serverless Cloud API. Useful for a quick check
  before downloading weights, but it costs one inference credit per cell (72 per
  card) and the app's timeout is 60 seconds.

Both adapters return `strokes=None` for blank, unreadable or low-confidence
cells. They never fill a missing score.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import cv2
import numpy as np

from .cells import prepare_model_input
from .config import Settings


class ModelNotConfigured(RuntimeError):
    reason = "model_not_configured"


class ModelConfigError(RuntimeError):
    reason = "model_config_error"


class InferenceError(RuntimeError):
    reason = "inference_failed"


@dataclass
class CellPrediction:
    label: str
    strokes: int | None
    confidence: float | None


class CellClassifier(Protocol):
    engine: str
    version: str

    def classify(self, cell: np.ndarray) -> CellPrediction: ...


def _load_classes(path: Path) -> list[str]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise ModelConfigError(f"Could not read the model classes file: {path}") from exc
    except json.JSONDecodeError as exc:
        raise ModelConfigError(f"The model classes file is not valid JSON: {path}") from exc
    if isinstance(data, list):
        classes = [str(item) for item in data]
    elif isinstance(data, dict):
        if "classes" in data and isinstance(data["classes"], list):
            classes = [str(item) for item in data["classes"]]
        else:
            try:
                ordered = sorted(((int(key), str(value)) for key, value in data.items()))
            except ValueError as exc:
                raise ModelConfigError(
                    "The classes object must map integer indexes to label strings."
                ) from exc
            if [index for index, _ in ordered] != list(range(len(ordered))):
                raise ModelConfigError(
                    "The classes object must use contiguous indexes starting at 0."
                )
            classes = [label for _, label in ordered]
    else:
        raise ModelConfigError("The model classes file must be a list or an object.")
    if not classes:
        raise ModelConfigError("The model classes list is empty.")
    return classes


def label_to_strokes(label: str) -> int | None:
    normalized = label.strip().lower()
    if normalized in {"", "blank", "empty", "unreadable", "unknown", "none", "null"}:
        return None
    try:
        value = int(normalized)
    except ValueError:
        return None
    return value if 1 <= value <= 20 else None


def _softmax(values: np.ndarray) -> np.ndarray:
    shifted = values - np.max(values)
    exponent = np.exp(shifted)
    total = float(exponent.sum())
    if total <= 0 or not math.isfinite(total):
        return np.zeros_like(values)
    return exponent / total


def _probabilities(output: np.ndarray) -> np.ndarray:
    flat = np.asarray(output, dtype=np.float32).reshape(-1)
    if flat.size == 0:
        raise InferenceError("The model returned an empty output.")
    if float(flat.min()) >= 0.0 and abs(float(flat.sum()) - 1.0) < 1e-3:
        return flat
    return _softmax(flat)


class OnnxCellClassifier:
    def __init__(
        self,
        model_path: Path,
        classes_path: Path,
        *,
        input_size: int,
        input_channels: int,
        input_layout: str,
        input_normalize: str,
        confidence_threshold: float,
        engine: str,
        version: str,
    ) -> None:
        if not model_path.is_file():
            raise ModelConfigError(f"SCAN_MODEL_PATH does not exist: {model_path}")
        if not classes_path.is_file():
            raise ModelConfigError(f"SCAN_MODEL_CLASSES does not exist: {classes_path}")
        try:
            import onnxruntime as ort  # type: ignore[import-not-found]
        except ImportError as exc:
            raise ModelConfigError(
                "onnxruntime is not installed. Run: python -m pip install -r requirements.txt"
            ) from exc
        self.classes = _load_classes(classes_path)
        self.input_size = input_size
        self.input_channels = input_channels
        self.input_layout = input_layout
        self.input_normalize = input_normalize
        self.confidence_threshold = confidence_threshold
        self.engine = engine
        self.version = version
        try:
            self.session = ort.InferenceSession(
                str(model_path), providers=["CPUExecutionProvider"]
            )
        except Exception as exc:  # onnxruntime raises several unrelated types
            raise ModelConfigError(f"The ONNX model could not be loaded: {exc}") from exc
        inputs = self.session.get_inputs()
        if not inputs:
            raise ModelConfigError("The ONNX model has no inputs.")
        self.input_name = inputs[0].name
        self._check_input_shape(inputs[0].shape)

    def _check_input_shape(self, shape: object) -> None:
        if not isinstance(shape, (list, tuple)):
            return
        dimensions = list(shape)
        if len(dimensions) != 4:
            raise ModelConfigError(
                "The ONNX model input must be a 4-D image tensor, "
                f"got shape {dimensions}."
            )
        known = [int(value) for value in dimensions if isinstance(value, int)]
        if not known:
            return
        expected = (
            [1, self.input_channels, self.input_size, self.input_size]
            if self.input_layout == "nchw"
            else [1, self.input_size, self.input_size, self.input_channels]
        )
        for actual, wanted in zip(dimensions, expected):
            if isinstance(actual, int) and actual not in (wanted, -1):
                raise ModelConfigError(
                    "The ONNX input shape does not match the configured preprocessing: "
                    f"model has {dimensions}, expected {expected}. Set "
                    "SCAN_MODEL_INPUT_SIZE / SCAN_MODEL_INPUT_CHANNELS / "
                    "SCAN_MODEL_INPUT_LAYOUT to match the export."
                )

    def classify(self, cell: np.ndarray) -> CellPrediction:
        tensor = prepare_model_input(
            cell,
            size=self.input_size,
            channels=self.input_channels,
            layout=self.input_layout,
            normalize=self.input_normalize,
        )
        try:
            outputs = self.session.run(None, {self.input_name: tensor})
        except Exception as exc:
            raise InferenceError(f"Local model inference failed: {exc}") from exc
        if not outputs:
            raise InferenceError("The local model returned no outputs.")
        probabilities = _probabilities(outputs[0])
        if probabilities.size != len(self.classes):
            raise InferenceError(
                "The model output size does not match the classes file: "
                f"{probabilities.size} scores for {len(self.classes)} classes."
            )
        index = int(np.argmax(probabilities))
        label = self.classes[index]
        confidence = float(probabilities[index])
        strokes = label_to_strokes(label)
        if confidence < self.confidence_threshold:
            strokes = None
        return CellPrediction(label=label, strokes=strokes, confidence=round(confidence, 4))


class RoboflowHostedClassifier:
    """Roboflow Serverless Cloud API adapter.

    Implemented against the documented `serverless.roboflow.com/{model_id}`
    multipart interface. It has not been exercised against a live project because
    no API key was available in this worktree; treat it as untested until the key
    and model id exist.
    """

    def __init__(
        self,
        *,
        api_key: str,
        model_id: str,
        base_url: str,
        timeout_seconds: float,
        confidence_threshold: float,
    ) -> None:
        if not api_key:
            raise ModelConfigError("ROBOFLOW_API_KEY is empty.")
        if not model_id:
            raise ModelConfigError("ROBOFLOW_MODEL_ID is empty.")
        try:
            import httpx  # type: ignore[import-not-found]
        except ImportError as exc:
            raise ModelConfigError(
                "httpx is not installed. Run: python -m pip install -r requirements.txt"
            ) from exc
        self.api_key = api_key
        self.model_id = model_id
        self.base_url = base_url.rstrip("/")
        self.confidence_threshold = confidence_threshold
        self.engine = "roboflow-serverless"
        self.version = model_id
        self.client = httpx.Client(
            timeout=timeout_seconds,
            limits=httpx.Limits(max_connections=16, max_keepalive_connections=8),
            headers={"Authorization": f"Bearer {api_key}"},
        )

    def _encode(self, cell: np.ndarray) -> bytes:
        height, width = cell.shape[:2]
        side = max(height, width)
        padded = np.full((side, side, 3), 255, dtype=np.uint8)
        top = (side - height) // 2
        left = (side - width) // 2
        padded[top : top + height, left : left + width] = cell
        resized = cv2.resize(padded, (160, 160), interpolation=cv2.INTER_AREA)
        ok, encoded = cv2.imencode(".jpg", resized, [cv2.IMWRITE_JPEG_QUALITY, 92])
        if not ok:
            raise InferenceError("Could not encode a cell for hosted inference.")
        return encoded.tobytes()

    def classify(self, cell: np.ndarray) -> CellPrediction:
        try:
            response = self.client.post(
                f"{self.base_url}/{self.model_id}",
                files={"file": ("cell.jpg", self._encode(cell), "image/jpeg")},
            )
        except Exception as exc:  # network, timeout, DNS
            raise InferenceError(f"Roboflow hosted inference failed: {exc}") from exc
        if response.status_code != 200:
            raise InferenceError(
                f"Roboflow hosted inference returned HTTP {response.status_code}."
            )
        try:
            data = response.json()
        except ValueError as exc:
            raise InferenceError("Roboflow hosted inference returned non-JSON.") from exc
        label, confidence = _parse_hosted_prediction(data)
        strokes = label_to_strokes(label)
        if confidence is None or confidence < self.confidence_threshold:
            strokes = None
        return CellPrediction(label=label, strokes=strokes, confidence=confidence)


def _parse_hosted_prediction(data: object) -> tuple[str, float | None]:
    if not isinstance(data, dict):
        raise InferenceError("Roboflow returned an unexpected response shape.")
    label = data.get("top")
    confidence = data.get("confidence")
    if isinstance(label, str) and label.strip():
        return label, float(confidence) if isinstance(confidence, (int, float)) else None
    predictions = data.get("predictions")
    best: tuple[str, float] | None = None
    if isinstance(predictions, list):
        for item in predictions:
            if not isinstance(item, dict):
                continue
            candidate = item.get("class")
            score = item.get("confidence")
            if (
                isinstance(candidate, str)
                and isinstance(score, (int, float))
                and (best is None or float(score) > best[1])
            ):
                best = (candidate, float(score))
    elif isinstance(predictions, dict):
        for candidate, score in predictions.items():
            if (
                isinstance(candidate, str)
                and isinstance(score, (int, float))
                and (best is None or float(score) > best[1])
            ):
                best = (candidate, float(score))
    if best is None:
        raise InferenceError("Roboflow returned no classification prediction.")
    return best


def _resolve_classes_path(settings: Settings) -> Path | None:
    if settings.classes_path is not None:
        return settings.classes_path
    if settings.model_path is None:
        return None
    for candidate in (
        settings.model_path.with_suffix(".classes.json"),
        settings.model_path.parent / "classes.json",
    ):
        if candidate.is_file():
            return candidate
    return None


def build_classifier(settings: Settings) -> CellClassifier:
    if settings.backend == "none":
        raise ModelNotConfigured(
            "No card reader model is configured. Set SCAN_MODEL_BACKEND=local_onnx "
            "with SCAN_MODEL_PATH and SCAN_MODEL_CLASSES, or configure "
            "ROBOFLOW_API_KEY and ROBOFLOW_MODEL_ID for hosted inference."
        )
    if settings.backend == "local_onnx":
        if settings.model_path is None:
            raise ModelConfigError("SCAN_MODEL_BACKEND=local_onnx requires SCAN_MODEL_PATH.")
        classes_path = _resolve_classes_path(settings)
        if classes_path is None:
            raise ModelConfigError(
                "SCAN_MODEL_BACKEND=local_onnx requires SCAN_MODEL_CLASSES "
                "(or a classes.json beside the model)."
            )
        return OnnxCellClassifier(
            settings.model_path,
            classes_path,
            input_size=settings.model_input_size,
            input_channels=settings.model_input_channels,
            input_layout=settings.model_input_layout,
            input_normalize=settings.model_input_normalize,
            confidence_threshold=settings.confidence_threshold,
            engine=settings.engine_name,
            version=settings.engine_version,
        )
    if settings.backend == "roboflow_hosted":
        return RoboflowHostedClassifier(
            api_key=settings.roboflow_api_key,
            model_id=settings.roboflow_model_id,
            base_url=settings.roboflow_base_url,
            timeout_seconds=settings.roboflow_timeout_seconds,
            confidence_threshold=settings.confidence_threshold,
        )
    raise ModelConfigError(f"Unknown backend: {settings.backend}")
