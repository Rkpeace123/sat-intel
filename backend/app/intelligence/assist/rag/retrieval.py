"""
Hybrid retrieval: dense vector (Chroma) ∪ BM25 keyword.

Fusion: fused_score = vscore + kscore (both normalised 0–1).
The BM25 index is built lazily from the Chroma collection contents
and cached in-process. Call invalidate(bucket) after any ingest.
"""
import re

from rank_bm25 import BM25Okapi

from app.intelligence.assist.rag import store
from app.intelligence.assist.rag.config import Bucket
from app.intelligence.assist.rag.embeddings import embed_one

# In-process BM25 cache: bucket → (BM25Okapi | None, docs)
_bm25_cache: dict[Bucket, tuple] = {}


def _tok(s: str) -> list[str]:
    return re.findall(r"\w+", s.lower())


def _bm25(bucket: Bucket) -> tuple:
    if bucket not in _bm25_cache:
        docs = store.all_docs(bucket)
        corpus = [_tok(d["text"]) for d in docs]
        index = BM25Okapi(corpus) if corpus else None
        _bm25_cache[bucket] = (index, docs)
    return _bm25_cache[bucket]


def invalidate(bucket: Bucket) -> None:
    """Drop cached BM25 index for bucket — call after every ingest."""
    _bm25_cache.pop(bucket, None)


def retrieve(bucket: Bucket, query: str, k: int) -> list[dict]:
    """
    Merge dense and BM25 results by ID, fuse scores, return top-k.
    """
    # Dense leg
    fused: dict[str, dict] = {
        h["id"]: {**h, "kscore": 0.0}
        for h in store.query(bucket, embed_one(query), k)
    }

    # BM25 leg
    bm25_index, docs = _bm25(bucket)
    if bm25_index is not None:
        scores = bm25_index.get_scores(_tok(query))
        mx = max(scores) if len(scores) and max(scores) > 0 else 1.0
        top_bm25 = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)[:k]
        for i in top_bm25:
            d, norm = docs[i], round(scores[i] / mx, 4)
            if d["id"] in fused:
                fused[d["id"]]["kscore"] = norm
            else:
                fused[d["id"]] = {**d, "vscore": 0.0, "kscore": norm}

    for h in fused.values():
        h["fused"] = round(h.get("vscore", 0.0) + h["kscore"], 4)

    return sorted(fused.values(), key=lambda h: h["fused"], reverse=True)[:k]
