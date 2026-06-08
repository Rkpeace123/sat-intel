from functools import lru_cache

from sentence_transformers import SentenceTransformer

from app.intelligence.assist.rag.config import EMBED_MODEL


@lru_cache(maxsize=1)
def _model() -> SentenceTransformer:
    """Load once at startup; offline after first pull."""
    return SentenceTransformer(EMBED_MODEL)


def embed(texts: list[str]) -> list[list[float]]:
    return _model().encode(
        texts, normalize_embeddings=True, show_progress_bar=False
    ).tolist()


def embed_one(text: str) -> list[float]:
    return embed([text])[0]
