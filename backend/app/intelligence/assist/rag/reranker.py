from functools import lru_cache

from sentence_transformers import CrossEncoder

from app.intelligence.assist.rag.config import RERANKER_MODEL


@lru_cache(maxsize=1)
def _model() -> CrossEncoder:
    """Load once at startup; offline after first pull."""
    return CrossEncoder(RERANKER_MODEL)


def rerank(query: str, hits: list[dict], top_n: int) -> list[dict]:
    """
    Score each hit with the cross-encoder, keep top_n,
    normalise scores to [0, 1] as `rnorm`.
    """
    if not hits:
        return []

    scores = _model().predict([(query, h["text"]) for h in hits])
    for h, s in zip(hits, scores):
        h["rerank"] = float(s)

    ranked = sorted(hits, key=lambda h: h["rerank"], reverse=True)[:top_n]

    mx = max(h["rerank"] for h in ranked)
    mn = min(h["rerank"] for h in ranked)
    rng = (mx - mn) or 1.0
    for h in ranked:
        h["rnorm"] = round((h["rerank"] - mn) / rng, 4)

    return ranked
