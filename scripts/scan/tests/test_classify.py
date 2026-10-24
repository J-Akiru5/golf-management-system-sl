import pytest

from igcc_scan.classify import (
    InferenceError,
    _parse_hosted_prediction,
    _probabilities,
    label_to_strokes,
)


def test_label_mapping_never_invents_a_score():
    assert label_to_strokes("7") == 7
    assert label_to_strokes("20") == 20
    assert label_to_strokes("0") is None
    assert label_to_strokes("21") is None
    assert label_to_strokes("blank") is None
    assert label_to_strokes("unreadable") is None
    assert label_to_strokes("something else") is None


def test_hardmax_probabilities_are_kept():
    probabilities = _probabilities([0.1, 0.7, 0.2])
    assert probabilities.tolist() == pytest.approx([0.1, 0.7, 0.2])


def test_logits_are_softmaxed():
    probabilities = _probabilities([0.0, 10.0, 0.0])
    assert probabilities[0] == pytest.approx(0.000045, abs=1e-5)
    assert probabilities[1] == pytest.approx(0.999909, abs=1e-4)
    assert float(probabilities.sum()) == pytest.approx(1.0)


def test_empty_model_output_is_an_error():
    with pytest.raises(InferenceError):
        _probabilities([])


def test_parse_hosted_top_level_prediction():
    label, confidence = _parse_hosted_prediction({"top": "8", "confidence": 0.91})
    assert label == "8"
    assert confidence == 0.91


def test_parse_hosted_predictions_list_and_dict():
    label, confidence = _parse_hosted_prediction(
        {"predictions": [{"class": "3", "confidence": 0.4}, {"class": "8", "confidence": 0.8}]}
    )
    assert (label, confidence) == ("8", 0.8)
    label, confidence = _parse_hosted_prediction({"predictions": {"blank": 0.7, "5": 0.2}})
    assert (label, confidence) == ("blank", 0.7)


def test_parse_hosted_unexpected_shape_is_an_error():
    with pytest.raises(InferenceError):
        _parse_hosted_prediction({"predictions": []})
    with pytest.raises(InferenceError):
        _parse_hosted_prediction("nope")
