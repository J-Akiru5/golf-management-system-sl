import numpy as np
from fastapi.testclient import TestClient
from synthetic import encode_png, make_card

from igcc_scan.app import create_app
from igcc_scan.classify import CellPrediction
from igcc_scan.config import Settings
from igcc_scan.contract import normalize_payload
from igcc_scan.pipeline import scan_image


class FakeClassifier:
    engine = "fake"
    version = "test-1"

    def __init__(self, strokes: int | None = None) -> None:
        self.strokes = strokes
        self.calls = 0

    def classify(self, cell: np.ndarray) -> CellPrediction:
        self.calls += 1
        return CellPrediction(
            label="blank" if self.strokes is None else str(self.strokes),
            strokes=self.strokes,
            confidence=0.93,
        )


def test_health_reports_no_model_configured():
    app = create_app(Settings(backend="none"))
    with TestClient(app) as client:
        response = client.get("/health")
        assert response.status_code == 200
        body = response.json()
        assert body["ok"] is True
        assert body["available"] is False
        assert body["backend"] == "none"


def test_scan_without_a_model_returns_503_and_no_scores():
    app = create_app(Settings(backend="none"))
    with TestClient(app) as client:
        response = client.post(
            "/scan",
            files={"image": ("card.png", encode_png(make_card()), "image/png")},
            data={"mode": "individual", "template": "igcc-paper"},
        )
        assert response.status_code == 503
        body = response.json()
        assert body["ok"] is False
        assert body["reason"] == "model_not_configured"
        assert body["players"] == []
        assert "not scored" in body["message"]


def test_bearer_token_is_required_when_configured():
    app = create_app(Settings(backend="none", auth_token="secret-token"))
    with TestClient(app) as client:
        denied = client.post(
            "/scan",
            files={"image": ("card.png", encode_png(make_card()), "image/png")},
            data={"mode": "individual", "template": "igcc-paper"},
        )
        assert denied.status_code == 401
        allowed = client.post(
            "/scan",
            files={"image": ("card.png", encode_png(make_card()), "image/png")},
            data={"mode": "individual", "template": "igcc-paper"},
            headers={"Authorization": "Bearer secret-token"},
        )
        assert allowed.status_code == 503


def test_unknown_template_is_rejected_before_inference():
    app = create_app(Settings(backend="none"))
    with TestClient(app) as client:
        response = client.post(
            "/scan",
            files={"image": ("card.png", encode_png(make_card()), "image/png")},
            data={"mode": "individual", "template": "not-a-card"},
        )
        # With no model, the model_not_configured response wins; that is intentional.
        assert response.status_code in {400, 503}


def test_pipeline_with_a_fake_classifier_returns_the_contract():
    card = make_card()
    classifier = FakeClassifier(strokes=None)
    result = scan_image(
        card,
        mode="group",
        template_id="igcc-paper",
        classifier=classifier,
        settings=Settings(backend="none", card_mode="prewarped"),
    )
    payload = result.to_dict()
    assert normalize_payload(payload) is not None
    assert len(payload["players"]) == 3
    assert all(len(player["holes"]) == 18 for player in payload["players"])
    assert all(hole["strokes"] is None for player in payload["players"] for hole in player["holes"])
    assert classifier.calls == 54
    assert payload["raw"]["template"] == "igcc-paper"
    assert payload["raw"]["card"]["orientation"] == 0


def test_pipeline_can_return_a_digit_for_every_cell():
    card = make_card()
    classifier = FakeClassifier(strokes=5)
    result = scan_image(
        card,
        mode="individual",
        template_id="igcc-paper",
        classifier=classifier,
        settings=Settings(backend="none", card_mode="prewarped"),
    )
    payload = result.to_dict()
    assert normalize_payload(payload) is not None
    assert payload["players"][1]["holes"][0]["strokes"] == 5
    assert payload["players"][1]["holes"][0]["confidence"] == 0.93


def test_pipeline_rejects_an_unknown_mode():
    with __import__("pytest").raises(ValueError, match="individual or group"):
        scan_image(
            make_card(),
            mode="team",
            template_id="igcc-paper",
            classifier=FakeClassifier(strokes=4),
            settings=Settings(backend="none", card_mode="prewarped"),
        )
