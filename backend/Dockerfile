FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# System deps for asyncpg compilation + curl for health probe
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps first (layer-cache friendly)
COPY pyproject.toml ./
RUN pip install --upgrade pip && pip install -e ".[dev]"

# Pre-bake embedding + reranker models into the image so first boot is offline
# (remove this RUN line if you want a smaller image and are OK with first-request download)
RUN python -c "\
from sentence_transformers import SentenceTransformer, CrossEncoder; \
SentenceTransformer('sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2'); \
CrossEncoder('BAAI/bge-reranker-base')"

COPY . .

# Create non-root user
RUN useradd -m -u 1001 satark && chown -R satark:satark /app
USER satark

EXPOSE 8000

CMD ["bash", "scripts/start.sh"]
