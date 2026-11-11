# Production image for the IGCC scorecard reader.
# Build from the repository root:
#   docker build -f scripts/scan/Dockerfile -t igcc-scorecard-reader scripts/scan
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000

# opencv-python-headless needs libglib; onnxruntime needs libgomp.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements-prod.txt ./
RUN pip install --no-cache-dir -r requirements-prod.txt

COPY igcc_scan ./igcc_scan
COPY igcc_photo_calibration.json ./igcc_photo_calibration.json

# Committed model inputs: the card-detection template and the class order the
# local ONNX adapter reads. The .onnx weights are not in Git; the service fetches
# them into /app/models at startup (see igcc_scan/model_fetch.py).
COPY models/igcc-card-template.npz ./models/igcc-card-template.npz
COPY models/classes.json ./models/classes.json

# Do not run as root. The service only reads its own files and calls the model.
# /app/models must stay writable by the service user, because the downloaded
# ONNX file is written there at startup.
RUN mkdir -p /app/models \
    && useradd --create-home --uid 10001 reader \
    && chown -R reader:reader /app
USER reader

EXPOSE 8000

# Render injects PORT; the shell form is required to expand it.
CMD ["sh", "-c", "uvicorn igcc_scan.app:app --host 0.0.0.0 --port ${PORT:-8000}"]
