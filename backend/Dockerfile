# API container for Cloud Run / Fly.io / Render. Run database migrations separately: npm run db:deploy
FROM python:3.12-slim

# pandoc must be 2.19+ so exports run with --sandbox (Debian's package is too old); pinned and checksum-verified.
ARG PANDOC_VERSION=3.7.0.2
ARG PANDOC_SHA256=4db8bad3d9f8451a3d52171664f3c58b08af6450fbd54a28dd05f6b00b0bbb04

RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr poppler-utils curl ca-certificates \
    && curl -fsSL -o /tmp/pandoc.deb "https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-1-amd64.deb" \
    && echo "${PANDOC_SHA256}  /tmp/pandoc.deb" | sha256sum -c - \
    && dpkg -i /tmp/pandoc.deb \
    && rm /tmp/pandoc.deb \
    && apt-get purge -y curl && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/main.py ./
COPY backend/src ./src

ENV PYTHONUNBUFFERED=1 HOST=0.0.0.0 PORT=8080
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
