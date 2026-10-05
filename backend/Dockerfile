# Zodiac Blend API + worker image
FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt \
    && python -m playwright install --with-deps chromium \
    && useradd --create-home --uid 10001 zodiac \
    && mkdir -p /app/storage && chown zodiac:zodiac /app/storage

COPY --chown=zodiac:zodiac . .

USER zodiac
ENV ZB_STORAGE_DIR=/app/storage
EXPOSE 8000

# API by default; the worker uses: python -m app.worker
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
