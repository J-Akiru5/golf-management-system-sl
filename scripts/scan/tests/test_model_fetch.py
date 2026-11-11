"""Tests for the startup model fetch. No test touches the network."""

from __future__ import annotations

import hashlib
from collections.abc import Callable, Iterator
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient
from synthetic import encode_png, make_card

import igcc_scan.app as app_module
from igcc_scan import model_fetch
from igcc_scan.config import ConfigError
from igcc_scan.model_fetch import ensure_model

BODY = b"\x08\x0eonnx-bytes-do-not-need-to-be-a-real-model"
SHA256 = hashlib.sha256(BODY).hexdigest()
OTHER_SHA256 = hashlib.sha256(b"something else").hexdigest()


def use_transport(
    monkeypatch: pytest.MonkeyPatch, handler: Callable[[httpx.Request], httpx.Response]
) -> list[float]:
    """Route the module's HTTP client through a mock transport."""
    timeouts: list[float] = []

    def factory(*, timeout: float) -> httpx.Client:
        timeouts.append(timeout)
        return httpx.Client(transport=httpx.MockTransport(handler))

    monkeypatch.setattr(model_fetch, "_new_client", factory)
    return timeouts


def env_for(
    target: object,
    url: str,
    *,
    sha256: str = SHA256,
    token: str = "",
) -> dict[str, str]:
    values = {
        "SCAN_MODEL_PATH": str(target),
        "SCAN_MODEL_URL": url,
        "SCAN_MODEL_SHA256": sha256,
    }
    if token:
        values["SCAN_MODEL_URL_TOKEN"] = token
    return values


def refuses(request: httpx.Request) -> httpx.Response:
    raise AssertionError("the model must not be downloaded in this case")


def test_an_existing_model_file_is_not_downloaded_again(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    target = tmp_path / "model.onnx"
    target.write_bytes(BODY)
    use_transport(monkeypatch, refuses)

    path = ensure_model(env_for(target, "https://bucket.example/model.onnx"))

    assert path == target
    assert target.read_bytes() == BODY


def test_no_url_and_no_file_returns_none(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    use_transport(monkeypatch, refuses)

    assert ensure_model({"SCAN_MODEL_PATH": str(tmp_path / "absent.onnx")}) is None


def test_an_http_url_is_refused(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    target = tmp_path / "model.onnx"
    use_transport(monkeypatch, refuses)

    with pytest.raises(ConfigError, match="https"):
        ensure_model(env_for(target, "http://bucket.example/model.onnx"))

    assert not target.exists()


def test_a_missing_sha256_is_refused(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    target = tmp_path / "model.onnx"
    use_transport(monkeypatch, refuses)

    with pytest.raises(ConfigError, match="SCAN_MODEL_SHA256"):
        ensure_model(
            {
                "SCAN_MODEL_PATH": str(target),
                "SCAN_MODEL_URL": "https://bucket.example/model.onnx",
            }
        )

    assert not target.exists()


def test_a_malformed_sha256_is_refused(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    target = tmp_path / "model.onnx"
    use_transport(monkeypatch, refuses)

    with pytest.raises(ConfigError, match="64 hexadecimal"):
        ensure_model(env_for(target, "https://bucket.example/model.onnx", sha256="abc123"))

    assert not target.exists()


def test_a_wrong_sha256_deletes_the_download(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    target = tmp_path / "model.onnx"
    use_transport(monkeypatch, lambda request: httpx.Response(200, content=BODY))

    with pytest.raises(ConfigError, match="SCAN_MODEL_SHA256"):
        ensure_model(env_for(target, "https://bucket.example/model.onnx", sha256=OTHER_SHA256))

    assert not target.exists()
    assert list(tmp_path.iterdir()) == []


def test_a_correct_sha256_writes_the_model(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    target = tmp_path / "nested" / "model.onnx"
    timeouts = use_transport(monkeypatch, lambda request: httpx.Response(200, content=BODY))

    path = ensure_model(env_for(target, "https://bucket.example/model.onnx"))

    assert path == target
    assert target.read_bytes() == BODY
    assert [item.name for item in tmp_path.rglob("*") if item.is_file()] == ["model.onnx"]
    assert timeouts == [60.0]


def test_an_oversize_body_is_refused(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    target = tmp_path / "model.onnx"
    monkeypatch.setattr(model_fetch, "MAX_MODEL_BYTES", 16)
    use_transport(monkeypatch, lambda request: httpx.Response(200, content=BODY))

    with pytest.raises(ConfigError, match="larger than"):
        ensure_model(env_for(target, "https://bucket.example/model.onnx", sha256=SHA256))

    assert not target.exists()
    assert list(tmp_path.iterdir()) == []


def test_an_oversize_declared_length_is_refused_before_the_body(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    target = tmp_path / "model.onnx"
    monkeypatch.setattr(model_fetch, "MAX_MODEL_BYTES", 16)

    def handler(request: httpx.Request) -> httpx.Response:
        chunks: Iterator[bytes] = iter([b"\x00" * 8] * 1000)
        return httpx.Response(
            200, headers={"Content-Length": str(50 * 1024 * 1024)}, content=chunks
        )

    use_transport(monkeypatch, handler)

    with pytest.raises(ConfigError, match="larger than"):
        ensure_model(env_for(target, "https://bucket.example/model.onnx"))

    assert not target.exists()
    assert list(tmp_path.iterdir()) == []


def test_the_default_limit_is_fifty_megabytes() -> None:
    assert model_fetch.MAX_MODEL_BYTES == 50 * 1024 * 1024


def test_the_token_header_is_sent_only_when_set(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    seen: list[str | None] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.headers.get("authorization"))
        return httpx.Response(200, content=BODY)

    use_transport(monkeypatch, handler)
    url = "https://bucket.example/model.onnx"

    ensure_model(env_for(tmp_path / "with-token.onnx", url, token="s3cret-token"))
    ensure_model(env_for(tmp_path / "without-token.onnx", url))

    assert seen == ["Bearer s3cret-token", None]


def test_the_token_and_query_string_never_reach_an_error_message(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    token = "tok_never_logged"
    query = "X-Amz-Signature=signature_never_logged"
    url = f"https://bucket.example/model.onnx?{query}"
    requested: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requested.append(str(request.url))
        return httpx.Response(500, content=b"bucket said no")

    use_transport(monkeypatch, handler)

    with pytest.raises(ConfigError) as failure:
        ensure_model(env_for(tmp_path / "model.onnx", url, token=token))

    message = str(failure.value)
    assert token not in message
    assert "signature_never_logged" not in message
    assert "X-Amz-Signature" not in message
    # The request itself still needs the signed query string.
    assert requested == [url]


def test_a_checksum_mismatch_does_not_leak_the_token_or_query(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    token = "tok_never_logged"
    use_transport(monkeypatch, lambda request: httpx.Response(200, content=BODY))

    with pytest.raises(ConfigError) as failure:
        ensure_model(
            env_for(
                tmp_path / "model.onnx",
                "https://bucket.example/model.onnx?sig=signature_never_logged",
                sha256=OTHER_SHA256,
                token=token,
            )
        )

    message = str(failure.value)
    assert token not in message
    assert "signature_never_logged" not in message


def test_startup_fetch_failure_answers_503_model_config_error(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    classes = tmp_path / "classes.json"
    classes.write_text('["1","blank"]', encoding="utf-8")
    target = tmp_path / "model.onnx"
    monkeypatch.setenv("SCAN_MODEL_BACKEND", "local_onnx")
    monkeypatch.setenv("SCAN_MODEL_PATH", str(target))
    monkeypatch.setenv("SCAN_MODEL_CLASSES", str(classes))
    monkeypatch.setenv("SCAN_MODEL_URL", "https://bucket.example/model.onnx")
    monkeypatch.setenv("SCAN_MODEL_SHA256", SHA256)
    use_transport(monkeypatch, lambda request: httpx.Response(404, content=b"missing"))

    app = app_module.create_app()
    with TestClient(app) as client:
        health = client.get("/health").json()
        assert health["ok"] is True
        assert health["available"] is False
        assert health["configurationError"] == "set; see service log"

        response = client.post(
            "/scan",
            files={"image": ("card.png", encode_png(make_card()), "image/png")},
            data={"mode": "individual", "template": "igcc-paper"},
        )

    assert response.status_code == 503
    assert response.json()["reason"] == "model_config_error"
    assert response.json()["players"] == []
    assert not target.exists()


def test_startup_uses_the_fetched_model_path(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    fetched = tmp_path / "downloaded.onnx"
    fetched.write_bytes(BODY)
    monkeypatch.setenv("SCAN_MODEL_BACKEND", "local_onnx")
    monkeypatch.setenv("SCAN_MODEL_PATH", str(tmp_path / "configured.onnx"))
    monkeypatch.setenv("SCAN_MODEL_CLASSES", str(tmp_path / "classes.json"))

    class FakeClassifier:
        engine = "fake"
        version = "test"

        def classify(self, cell: object) -> object:  # pragma: no cover - not called
            raise AssertionError("no cell is classified in this test")

    seen: list[object] = []

    def fake_build(settings: object) -> FakeClassifier:
        seen.append(getattr(settings, "model_path", None))
        return FakeClassifier()

    monkeypatch.setattr(app_module, "ensure_model", lambda: fetched)
    monkeypatch.setattr(app_module, "build_classifier", fake_build)

    app = app_module.create_app()
    with TestClient(app) as client:
        health = client.get("/health").json()

    assert seen == [fetched]
    assert health["available"] is True
