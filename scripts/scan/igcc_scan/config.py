"""Environment-driven settings. No secret is ever printed by `describe()`."""

from __future__ import annotations

import json
import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path


class ConfigError(ValueError):
    """The service is configured in a way it cannot honour."""


def _env(env: Mapping[str, str], name: str, default: str = "") -> str:
    return (env.get(name) or default).strip()


def _env_int(env: Mapping[str, str], name: str, default: int, low: int, high: int) -> int:
    raw = _env(env, name)
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError as exc:
        raise ConfigError(f"{name} must be an integer.") from exc
    if not low <= value <= high:
        raise ConfigError(f"{name} must be between {low} and {high}.")
    return value


def _env_float(env: Mapping[str, str], name: str, default: float, low: float, high: float) -> float:
    raw = _env(env, name)
    if not raw:
        return default
    try:
        value = float(raw)
    except ValueError as exc:
        raise ConfigError(f"{name} must be a number.") from exc
    if not low <= value <= high:
        raise ConfigError(f"{name} must be between {low} and {high}.")
    return value


def _env_bool(env: Mapping[str, str], name: str, default: bool = False) -> bool:
    raw = _env(env, name).lower()
    if not raw:
        return default
    if raw in {"1", "true", "yes", "on"}:
        return True
    if raw in {"0", "false", "no", "off"}:
        return False
    raise ConfigError(f"{name} must be 0/1, true/false, yes/no or on/off.")


def parse_corners(raw: str) -> tuple[tuple[float, float], ...] | None:
    """Parse `x,y x,y x,y x,y` or a JSON list of four points."""
    if not raw.strip():
        return None
    try:
        if raw.strip().startswith("["):
            data = json.loads(raw)
            points = [(float(point[0]), float(point[1])) for point in data]
        else:
            points = []
            for part in raw.replace(";", " ").split():
                x, y = part.split(",")
                points.append((float(x), float(y)))
    except (ValueError, TypeError, IndexError, KeyError) as exc:
        raise ConfigError(
            "SCAN_CARD_CORNERS must be four x,y pairs, for example "
            '"100,80 1700,60 1720,960 90,980".'
        ) from exc
    if len(points) != 4:
        raise ConfigError("SCAN_CARD_CORNERS must contain exactly four points (TL TR BR BL).")
    return tuple(points)


@dataclass(frozen=True)
class Settings:
    backend: str = "auto"
    model_path: Path | None = None
    classes_path: Path | None = None
    model_input_size: int = 64
    model_input_channels: int = 1
    model_input_layout: str = "nchw"
    model_input_normalize: str = "unit"
    confidence_threshold: float = 0.60
    engine_name: str = "igcc-cell-classifier"
    engine_version: str = "0.1.0"
    roboflow_api_key: str = ""
    roboflow_model_id: str = ""
    roboflow_base_url: str = "https://serverless.roboflow.com"
    roboflow_timeout_seconds: float = 10.0
    classify_concurrency: int = 6
    auth_token: str = ""
    card_mode: str = "auto"
    card_corners: tuple[tuple[float, float], ...] | None = None
    card_rotation: int | None = None
    mask_dots: bool = False
    max_upload_bytes: int = 15 * 1024 * 1024
    debug_dir: Path | None = None

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> Settings:
        env = os.environ if env is None else env
        backend = _env(env, "SCAN_MODEL_BACKEND", "auto").lower()
        if backend not in {"auto", "none", "local_onnx", "roboflow_hosted"}:
            raise ConfigError(
                "SCAN_MODEL_BACKEND must be auto, none, local_onnx or roboflow_hosted."
            )
        model_path = _env(env, "SCAN_MODEL_PATH")
        classes_path = _env(env, "SCAN_MODEL_CLASSES")
        roboflow_api_key = _env(env, "ROBOFLOW_API_KEY")
        roboflow_model_id = _env(env, "ROBOFLOW_MODEL_ID")
        if backend == "auto":
            if model_path:
                backend = "local_onnx"
            elif roboflow_api_key and roboflow_model_id:
                backend = "roboflow_hosted"
            else:
                backend = "none"

        layout = _env(env, "SCAN_MODEL_INPUT_LAYOUT", "nchw").lower()
        if layout not in {"nchw", "nhwc"}:
            raise ConfigError("SCAN_MODEL_INPUT_LAYOUT must be nchw or nhwc.")
        normalize = _env(env, "SCAN_MODEL_INPUT_NORMALIZE", "unit").lower()
        if normalize not in {"unit", "minus_one_one", "imagenet", "none"}:
            raise ConfigError(
                "SCAN_MODEL_INPUT_NORMALIZE must be unit, minus_one_one, imagenet or none."
            )
        card_mode = _env(env, "SCAN_CARD_MODE", "auto").lower()
        if card_mode not in {"auto", "prewarped"}:
            raise ConfigError("SCAN_CARD_MODE must be auto or prewarped.")
        rotation_raw = _env(env, "SCAN_CARD_ROTATION")
        rotation: int | None = None
        if rotation_raw:
            try:
                rotation = int(rotation_raw)
            except ValueError as exc:
                raise ConfigError("SCAN_CARD_ROTATION must be 0, 90, 180 or 270.") from exc
            if rotation not in {0, 90, 180, 270}:
                raise ConfigError("SCAN_CARD_ROTATION must be 0, 90, 180 or 270.")

        debug_dir = _env(env, "SCAN_DEBUG_DIR")
        return cls(
            backend=backend,
            model_path=Path(model_path).expanduser() if model_path else None,
            classes_path=Path(classes_path).expanduser() if classes_path else None,
            model_input_size=_env_int(env, "SCAN_MODEL_INPUT_SIZE", 64, 16, 512),
            model_input_channels=_env_int(env, "SCAN_MODEL_INPUT_CHANNELS", 1, 1, 3),
            model_input_layout=layout,
            model_input_normalize=normalize,
            confidence_threshold=_env_float(
                env, "SCAN_CONFIDENCE_THRESHOLD", 0.60, 0.0, 1.0
            ),
            engine_name=_env(env, "SCAN_ENGINE_NAME", "igcc-cell-classifier"),
            engine_version=_env(env, "SCAN_ENGINE_VERSION", "0.1.0"),
            roboflow_api_key=roboflow_api_key,
            roboflow_model_id=roboflow_model_id,
            roboflow_base_url=_env(
                env, "ROBOFLOW_INFERENCE_URL", "https://serverless.roboflow.com"
            ).rstrip("/"),
            roboflow_timeout_seconds=_env_float(
                env, "ROBOFLOW_TIMEOUT_SECONDS", 10.0, 1.0, 60.0
            ),
            classify_concurrency=_env_int(env, "SCAN_CLASSIFY_CONCURRENCY", 6, 1, 16),
            auth_token=_env(env, "SCAN_INFERENCE_TOKEN"),
            card_mode=card_mode,
            card_corners=parse_corners(_env(env, "SCAN_CARD_CORNERS")),
            card_rotation=rotation,
            mask_dots=_env_bool(env, "SCAN_MASK_DOTS", False),
            max_upload_bytes=_env_int(
                env, "SCAN_MAX_UPLOAD_BYTES", 15 * 1024 * 1024, 1024, 50 * 1024 * 1024
            ),
            debug_dir=Path(debug_dir).expanduser() if debug_dir else None,
        )

    @property
    def configured(self) -> bool:
        return self.backend != "none"

    @property
    def auth_required(self) -> bool:
        return bool(self.auth_token)

    def describe(self) -> dict[str, object]:
        """Safe for `/health`: booleans and names, never keys, tokens or paths."""
        return {
            "configured": self.configured,
            "backend": self.backend,
            "engine": self.engine_name,
            "engineVersion": self.engine_version,
            "confidenceThreshold": self.confidence_threshold,
            "template": "igcc-paper",
            "cardMode": self.card_mode,
            "cardCornersConfigured": self.card_corners is not None,
            "cardRotation": self.card_rotation,
            "maskDots": self.mask_dots,
            "authRequired": self.auth_required,
            "modelFileConfigured": self.model_path is not None,
            "roboflowModelConfigured": bool(
                self.roboflow_api_key and self.roboflow_model_id
            ),
        }
