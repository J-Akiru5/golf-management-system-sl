import pytest

from igcc_scan.contract import (
    HoleReading,
    PlayerReading,
    ScanResult,
    finalize_result,
    normalize_payload,
    validate_scan_result,
)


def make_player(row_index: int = 0, **overrides) -> PlayerReading:
    holes = [
        HoleReading(hole=number, strokes=4, confidence=0.9) for number in range(1, 19)
    ]
    values = {"row_index": row_index, "holes": holes}
    values.update(overrides)
    return PlayerReading(**values)


def make_result() -> ScanResult:
    return ScanResult(
        engine="test-engine",
        engine_version="1",
        players=[make_player(0), make_player(1), make_player(2)],
        raw={"template": "igcc-paper"},
    )


def test_valid_result_matches_the_app_contract():
    result = finalize_result(make_result())
    payload = result.to_dict()
    assert validate_scan_result(result) == []
    normalized = normalize_payload(payload)
    assert normalized is not None
    assert normalized["engine"] == "test-engine"
    assert len(normalized["players"]) == 3
    assert len(normalized["players"][0]["holes"]) == 18
    assert [hole["hole"] for hole in normalized["players"][0]["holes"]] == list(
        range(1, 19)
    )


def test_missing_hole_is_never_invented():
    result = make_result()
    result.players[0].holes = result.players[0].holes[:17]
    with pytest.raises(ValueError, match="missing hole 18"):
        finalize_result(result)


def test_out_of_range_strokes_become_null():
    result = make_result()
    result.players[0].holes[0].strokes = 25
    result.players[0].holes[1].strokes = 0
    finalize_result(result)
    assert result.players[0].holes[0].strokes is None
    assert result.players[0].holes[1].strokes is None


def test_confidence_is_clamped():
    result = make_result()
    result.players[0].holes[0].confidence = 1.7
    result.players[0].holes[1].confidence = -0.2
    finalize_result(result)
    assert result.players[0].holes[0].confidence == 1.0
    assert result.players[0].holes[1].confidence == 0.0


def test_app_rejects_duplicate_or_missing_holes():
    payload = make_result().to_dict()
    payload["players"][0]["holes"][17] = payload["players"][0]["holes"][0]
    assert normalize_payload(payload) is None

    payload = make_result().to_dict()
    payload["players"][0]["holes"] = payload["players"][0]["holes"][:17]
    assert normalize_payload(payload) is None


def test_app_rejects_missing_engine():
    payload = make_result().to_dict()
    payload["engine"] = ""
    assert normalize_payload(payload) is None
    payload = make_result().to_dict()
    payload["engineVersion"] = ""
    assert normalize_payload(payload) is None


def test_app_rejects_empty_players():
    payload = make_result().to_dict()
    payload["players"] = []
    assert normalize_payload(payload) is None


def test_null_scores_and_confidence_survive():
    payload = make_result().to_dict()
    payload["players"][0]["holes"][0]["strokes"] = None
    payload["players"][0]["holes"][0]["confidence"] = None
    normalized = normalize_payload(payload)
    assert normalized is not None
    assert normalized["players"][0]["holes"][0]["strokes"] is None
    assert normalized["players"][0]["holes"][0]["confidence"] is None


def test_written_total_range():
    payload = make_result().to_dict()
    payload["players"][0]["writtenTotal"] = 301
    normalized = normalize_payload(payload)
    assert normalized is not None
    assert normalized["players"][0]["writtenTotal"] is None
