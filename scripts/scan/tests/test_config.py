import pytest

from igcc_scan.config import ConfigError, Settings, parse_corners


def test_auto_selects_none():
    settings = Settings.from_env({})
    assert settings.backend == "none"
    assert settings.configured is False


def test_auto_selects_local_model():
    settings = Settings.from_env({"SCAN_MODEL_PATH": "model.onnx"})
    assert settings.backend == "local_onnx"
    assert settings.configured is True


def test_auto_selects_hosted_model():
    settings = Settings.from_env(
        {"ROBOFLOW_API_KEY": "key", "ROBOFLOW_MODEL_ID": "igcc/digits/1"}
    )
    assert settings.backend == "roboflow_hosted"
    assert settings.configured is True


def test_explicit_none_wins():
    settings = Settings.from_env(
        {"SCAN_MODEL_BACKEND": "none", "SCAN_MODEL_PATH": "model.onnx"}
    )
    assert settings.backend == "none"


def test_parse_corners_accepts_text_and_json():
    text = parse_corners("100,80 1700,60 1720,960 90,980")
    assert text == ((100.0, 80.0), (1700.0, 60.0), (1720.0, 960.0), (90.0, 980.0))
    data = parse_corners("[[100,80],[1700,60],[1720,960],[90,980]]")
    assert data == text
    assert parse_corners("") is None


def test_bad_corners_and_values_raise():
    with pytest.raises(ConfigError):
        parse_corners("1,2 3,4")
    with pytest.raises(ConfigError):
        parse_corners("1,2 3,4 5,6 seven")
    with pytest.raises(ConfigError):
        Settings.from_env({"SCAN_MODEL_BACKEND": "cloud"})
    with pytest.raises(ConfigError):
        Settings.from_env({"SCAN_MODEL_INPUT_SIZE": "eight"})
    with pytest.raises(ConfigError):
        Settings.from_env({"SCAN_CONFIDENCE_THRESHOLD": "1.5"})
    with pytest.raises(ConfigError):
        Settings.from_env({"SCAN_CARD_ROTATION": "45"})


def test_describe_never_exposes_secrets():
    settings = Settings.from_env(
        {
            "SCAN_MODEL_BACKEND": "roboflow_hosted",
            "ROBOFLOW_API_KEY": "super-secret-key",
            "ROBOFLOW_MODEL_ID": "workspace/project/1",
            "SCAN_INFERENCE_TOKEN": "another-secret",
        }
    )
    description = settings.describe()
    serialized = repr(description)
    assert "super-secret-key" not in serialized
    assert "another-secret" not in serialized
    assert description["roboflowModelConfigured"] is True
    assert description["authRequired"] is True


def test_upload_limit_and_concurrency_bounds():
    with pytest.raises(ConfigError):
        Settings.from_env({"SCAN_CLASSIFY_CONCURRENCY": "0"})
    with pytest.raises(ConfigError):
        Settings.from_env({"SCAN_CLASSIFY_CONCURRENCY": "99"})


def test_dot_mask_is_opt_in():
    assert Settings.from_env({}).mask_dots is False
    assert Settings.from_env({"SCAN_MASK_DOTS": "1"}).mask_dots is True
    assert Settings.from_env({"SCAN_MASK_DOTS": "off"}).mask_dots is False
    with pytest.raises(ConfigError):
        Settings.from_env({"SCAN_MASK_DOTS": "maybe"})
