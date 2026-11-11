"""Fetch the local ONNX weights into the container at startup.

The weights are deliberately outside Git (`models/*.onnx` is ignored), so a
Render build from a Git checkout has no model file. The owner uploads the
`.onnx` to a private bucket and sets `SCAN_MODEL_URL`, `SCAN_MODEL_SHA256` and
optionally `SCAN_MODEL_URL_TOKEN`. `ensure_model()` downloads the file once,
verifies the SHA-256 and returns the path the classifier should load.

Rules:

* A `SCAN_MODEL_PATH` that already points at a file is used as it is. Nothing is
  downloaded, so the image can also be built with the weights baked in.
* Only https is accepted, redirects are not followed, and the body is capped at
  50 MB.
* `SCAN_MODEL_SHA256` is required whenever a URL is set. An unverified file is
  deleted and never loaded.
* The URL query string and the token are never returned, logged or put in an
  error message. Error messages name the variable, not its value.

Every failure raises `ConfigError`, which is the same error `Settings.from_env`
raises for a bad configuration: the service then starts with
`config_error` set and `/scan` answers 503 `model_config_error`.
"""

from __future__ import annotations

import hashlib
import os
import re
import tempfile
from collections.abc import Mapping
from pathlib import Path
from urllib.parse import urlsplit

import httpx

from .config import ConfigError

DEFAULT_MODEL_PATH = "/app/models/igcc-scorecard-digits.onnx"
MAX_MODEL_BYTES = 50 * 1024 * 1024
DOWNLOAD_TIMEOUT_SECONDS = 60.0

MODEL_PATH_ENV = "SCAN_MODEL_PATH"
MODEL_URL_ENV = "SCAN_MODEL_URL"
MODEL_SHA256_ENV = "SCAN_MODEL_SHA256"
MODEL_TOKEN_ENV = "SCAN_MODEL_URL_TOKEN"

_SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")


def _env(env: Mapping[str, str], name: str, default: str = "") -> str:
    return (env.get(name) or default).strip()


def _check_url(url: str) -> None:
    parts = urlsplit(url)
    if parts.scheme.lower() != "https" or not parts.netloc:
        raise ConfigError(
            f"{MODEL_URL_ENV} must be an https URL. The model is not fetched over anything else."
        )


def _expected_sha256(env: Mapping[str, str]) -> str:
    raw = _env(env, MODEL_SHA256_ENV).lower()
    if not raw:
        raise ConfigError(
            f"{MODEL_SHA256_ENV} is required when {MODEL_URL_ENV} is set. "
            "The model is not loaded without a checksum."
        )
    if not _SHA256_PATTERN.match(raw):
        raise ConfigError(
            f"{MODEL_SHA256_ENV} must be 64 hexadecimal characters, the SHA-256 of the model file."
        )
    return raw


def _new_client(*, timeout: float) -> httpx.Client:
    """A client that never follows a redirect, so the token stays on one host."""
    return httpx.Client(timeout=timeout, follow_redirects=False)


def _download(url: str, token: str, expected_sha256: str, target: Path) -> Path:
    headers = {"Accept": "application/octet-stream"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        target.parent.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise ConfigError(
            f"The model directory could not be created. Check that {MODEL_PATH_ENV} points "
            "at a writable directory."
        ) from exc

    descriptor, temp_name = tempfile.mkstemp(
        dir=str(target.parent), prefix=".igcc-model-", suffix=".part"
    )
    os.close(descriptor)
    temp_path = Path(temp_name)
    digest = hashlib.sha256()
    total = 0

    try:
        client = _new_client(timeout=DOWNLOAD_TIMEOUT_SECONDS)
        with client, client.stream("GET", url, headers=headers) as response:
            if response.status_code != 200:
                raise ConfigError(
                    f"The model download returned HTTP {response.status_code}. "
                    "The model file was not loaded."
                )
            declared = response.headers.get("content-length", "")
            if declared.isdigit() and int(declared) > MAX_MODEL_BYTES:
                raise ConfigError(
                    f"The model file is larger than the {MAX_MODEL_BYTES} byte limit. "
                    "The model file was not loaded."
                )
            with temp_path.open("wb") as handle:
                for chunk in response.iter_bytes():
                    total += len(chunk)
                    if total > MAX_MODEL_BYTES:
                        raise ConfigError(
                            f"The model file is larger than the {MAX_MODEL_BYTES} byte "
                            "limit. The model file was not loaded."
                        )
                    digest.update(chunk)
                    handle.write(chunk)
    except ConfigError:
        temp_path.unlink(missing_ok=True)
        raise
    except httpx.HTTPError as exc:
        temp_path.unlink(missing_ok=True)
        raise ConfigError(
            f"The model download failed ({type(exc).__name__}). The model file was not loaded."
        ) from exc
    except OSError as exc:
        temp_path.unlink(missing_ok=True)
        raise ConfigError(
            "The model file could not be written. Check that the model directory is writable."
        ) from exc

    if total == 0:
        temp_path.unlink(missing_ok=True)
        raise ConfigError(
            "The model download returned an empty file. The model file was not loaded."
        )

    if digest.hexdigest() != expected_sha256:
        temp_path.unlink(missing_ok=True)
        raise ConfigError(
            f"The downloaded model does not match {MODEL_SHA256_ENV}. "
            "The file was deleted and was not loaded."
        )

    os.replace(temp_path, target)
    return target


def ensure_model(env: Mapping[str, str] | None = None) -> Path | None:
    """Make the local model available and return its path, or None if absent.

    Returns the existing file when `SCAN_MODEL_PATH` already points at one.
    Downloads it when `SCAN_MODEL_URL` is set. Returns None when neither exists,
    which leaves the service in its current no-model state.
    """
    values = os.environ if env is None else env
    target = Path(_env(values, MODEL_PATH_ENV, DEFAULT_MODEL_PATH)).expanduser()
    if target.is_file():
        return target

    url = _env(values, MODEL_URL_ENV)
    if not url:
        return None

    _check_url(url)
    expected_sha256 = _expected_sha256(values)
    token = _env(values, MODEL_TOKEN_ENV)
    return _download(url, token, expected_sha256, target)
