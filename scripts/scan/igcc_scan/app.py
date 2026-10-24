"""FastAPI service implementing `POST /scan`.

The service is intentionally boring: it validates configuration, decodes the
image, rectifies the card, classifies 72 cells and returns the contract the
Next.js app already normalizes. When no model is configured it returns 503 and
says so. It never returns made-up scores.
"""

from __future__ import annotations

import hmac
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse

from .classify import (
    InferenceError,
    ModelConfigError,
    ModelNotConfigured,
    build_classifier,
)
from .config import ConfigError, Settings
from .geometry import IGCC_PAPER
from .pipeline import InvalidScanRequest, UnknownTemplate, scan_image
from .rectify import CardNotFoundError, ImageDecodeError, decode_image

LOGGER = logging.getLogger("igcc_scan")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


def _error(
    status: int,
    reason: str,
    message: str,
    *,
    engine: str = "unconfigured",
    version: str = "0",
) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={
            "ok": False,
            "available": False,
            "reason": reason,
            "message": message,
            "engine": engine,
            "engineVersion": version,
            "players": [],
        },
    )


def create_app(settings: Settings | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        state = app.state
        if settings is not None:
            state.settings = settings
            state.config_error = None
        else:
            try:
                state.settings = Settings.from_env()
                state.config_error = None
            except ConfigError as exc:
                LOGGER.error("Invalid configuration: %s", exc)
                state.settings = Settings()
                state.config_error = str(exc)
        state.classifier = None
        if state.config_error is None:
            try:
                state.classifier = build_classifier(state.settings)
                LOGGER.info(
                    "Card reader ready: backend=%s engine=%s version=%s",
                    state.settings.backend,
                    getattr(state.classifier, "engine", state.settings.engine_name),
                    getattr(state.classifier, "version", state.settings.engine_version),
                )
            except ModelNotConfigured:
                LOGGER.warning("No card reader model is configured; /scan will return 503.")
            except (ModelConfigError, ConfigError) as exc:
                LOGGER.error("Card reader configuration error: %s", exc)
                state.config_error = str(exc)
            except Exception as exc:
                LOGGER.exception("Unexpected card reader startup failure")
                state.config_error = f"Unexpected startup failure: {exc}"
        yield
        classifier = state.classifier
        client = getattr(classifier, "client", None)
        if client is not None:
            try:
                client.close()
            except Exception as exc:  # noqa: BLE001
                LOGGER.debug("Could not close the hosted inference client: %s", exc)

    app = FastAPI(
        title="IGCC scorecard scan",
        version="0.1.0",
        description="Local card reader for the IGCC paper scorecard. See docs/SCORECARD_SCAN_MODEL.md.",
        lifespan=lifespan,
    )

    def settings_for(app: FastAPI) -> Settings:
        return app.state.settings

    def unauthorized() -> JSONResponse:
        return _error(
            401,
            "unauthorized",
            "Missing or invalid bearer token.",
        )

    def authorized(request: Request) -> bool:
        token = settings_for(request.app).auth_token
        if not token:
            return True
        header = request.headers.get("authorization", "")
        return hmac.compare_digest(header, f"Bearer {token}")

    def unavailable(app: FastAPI) -> JSONResponse:
        settings = settings_for(app)
        if app.state.config_error is not None:
            return _error(
                503,
                "model_config_error",
                "The card reader is configured but could not start. Check the service log. "
                "No scores were read.",
                engine=settings.engine_name,
                version=settings.engine_version,
            )
        return _error(
            503,
            "model_not_configured",
            "No scorecard model is configured. Set SCAN_MODEL_BACKEND=local_onnx with "
            "SCAN_MODEL_PATH and SCAN_MODEL_CLASSES, or set ROBOFLOW_API_KEY and "
            "ROBOFLOW_MODEL_ID for hosted inference. The photo was not scored.",
            engine=settings.engine_name,
            version=settings.engine_version,
        )

    @app.get("/")
    async def root() -> dict[str, object]:
        return {
            "service": "igcc-scorecard-scan",
            "version": "0.1.0",
            "health": "/health",
            "scan": "POST /scan",
            "docs": "/docs",
        }

    @app.get("/health")
    async def health(request: Request) -> dict[str, object]:
        settings = settings_for(request.app)
        description = settings.describe()
        description["available"] = request.app.state.classifier is not None
        description["configurationError"] = (
            "set; see service log" if request.app.state.config_error else None
        )
        return {"ok": True, "service": "igcc-scorecard-scan", **description}

    @app.get("/template")
    async def template() -> dict[str, object]:
        return {
            "template": IGCC_PAPER.template_id,
            "version": IGCC_PAPER.version,
            "width": IGCC_PAPER.width,
            "height": IGCC_PAPER.height,
            "cellInset": IGCC_PAPER.cell_inset,
            "holeColumns": [list(column) for column in IGCC_PAPER.hole_columns],
            "playerRows": [list(row) for row in IGCC_PAPER.player_rows],
            "nameColumn": list(IGCC_PAPER.name_column),
            "totalColumns": {
                name: list(column) for name, column in IGCC_PAPER.total_columns.items()
            },
            "dotSearchRegion": list(IGCC_PAPER.dot_search_region),
            "note": "Coordinates are pixels on a 1800x1000 rectified card.",
        }

    @app.post("/scan")
    async def scan(
        request: Request,
        image: UploadFile = File(...),  # noqa: B008 - FastAPI dependency idiom
        mode: str = Form("individual"),
        template: str = Form("igcc-paper"),
    ) -> JSONResponse:
        if not authorized(request):
            return unauthorized()
        settings = settings_for(request.app)
        classifier = request.app.state.classifier
        if classifier is None:
            return unavailable(request.app)
        if template != IGCC_PAPER.template_id:
            return _error(
                400,
                "unknown_template",
                f"Unknown card template {template!r}. The only supported template is "
                f"{IGCC_PAPER.template_id!r}.",
                engine=classifier.engine,
                version=classifier.version,
            )
        try:
            data = await image.read(settings.max_upload_bytes + 1)
        except Exception as exc:  # noqa: BLE001
            LOGGER.warning("Could not read upload: %s", exc)
            return _error(
                400,
                "image_read_failed",
                "The uploaded image could not be read.",
                engine=classifier.engine,
                version=classifier.version,
            )
        if len(data) > settings.max_upload_bytes:
            return _error(
                413,
                "image_too_large",
                f"The image exceeds the {settings.max_upload_bytes} byte limit.",
                engine=classifier.engine,
                version=classifier.version,
            )
        if not data:
            return _error(
                400,
                "image_empty",
                "The uploaded image is empty.",
                engine=classifier.engine,
                version=classifier.version,
            )
        try:
            decoded = decode_image(data)
        except ImageDecodeError as exc:
            return _error(
                400,
                "image_invalid",
                str(exc),
                engine=classifier.engine,
                version=classifier.version,
            )
        try:
            result = scan_image(
                decoded,
                mode=mode,
                template_id=template,
                classifier=classifier,
                settings=settings,
            )
        except CardNotFoundError as exc:
            return _error(
                422,
                "card_not_detected",
                str(exc),
                engine=classifier.engine,
                version=classifier.version,
            )
        except InvalidScanRequest as exc:
            return _error(
                400,
                "invalid_request",
                str(exc),
                engine=classifier.engine,
                version=classifier.version,
            )
        except UnknownTemplate as exc:
            return _error(
                400,
                "unknown_template",
                str(exc),
                engine=classifier.engine,
                version=classifier.version,
            )
        except InferenceError as exc:
            LOGGER.warning("Inference failed: %s", exc)
            return _error(
                502,
                "inference_failed",
                str(exc),
                engine=classifier.engine,
                version=classifier.version,
            )
        except Exception:
            LOGGER.exception("Unexpected scan failure")
            return _error(
                500,
                "scan_failed",
                "The card reader failed unexpectedly. No scores were returned.",
                engine=classifier.engine,
                version=classifier.version,
            )
        LOGGER.info(
            "Scanned card: mode=%s cells=%s failed=%s durationMs=%s",
            mode,
            result.raw.get("cells"),
            result.raw.get("failed"),
            result.raw.get("durationMs"),
        )
        return JSONResponse(status_code=200, content=result.to_dict())

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("igcc_scan.app:app", host="127.0.0.1", port=8000, reload=False)
