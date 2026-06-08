"""
RAG service — public interface for the assist lane.

answer()        — for doc buckets (survey_gen, validation, trust, policy)
classify_code() — for coding bucket (retrieval-first, NO LLM in the path)

BOTH functions set is_verdict=False.  This is a hard invariant.
"""
from app.intelligence.assist.rag import llm, reranker, retrieval
from app.intelligence.assist.rag.config import Bucket, CONF_THRESHOLD, CONTEXT_K, RETRIEVE_K


def _confidence(reranked: list[dict], answer: str) -> int:
    """
    Weighted confidence: 70 % top-hit rerank score + 30 % coverage ratio.
    Capped at 35 if the model returned INSUFFICIENT_EVIDENCE.
    """
    if not reranked:
        return 0
    top = reranked[0].get("rnorm", reranked[0].get("fused", 0.0))
    coverage = min(len(reranked), CONTEXT_K) / CONTEXT_K
    base = 100 * (0.7 * top + 0.3 * coverage)
    if "INSUFFICIENT_EVIDENCE" in answer:
        base = min(base, 35.0)
    return int(round(base))


async def answer(bucket: Bucket, question: str) -> dict:
    """
    Grounded Q&A for doc buckets.
    Returns: answer text, confidence 0-100, source list, needs_review flag.
    is_verdict is ALWAYS False.
    """
    pool = retrieval.retrieve(bucket, question, RETRIEVE_K)
    reranked = reranker.rerank(question, pool, CONTEXT_K)

    if not reranked:
        return {
            "answer": "I don't have grounded evidence for this.",
            "confidence": 0,
            "sources": [],
            "needs_review": True,
            "is_verdict": False,
        }

    ctx = "\n\n".join(f"[{i+1}] {h['text']}" for i, h in enumerate(reranked))
    text = await llm.generate(question, ctx)
    conf = _confidence(reranked, text)

    if "INSUFFICIENT_EVIDENCE" in text:
        text = "I don't have enough grounded evidence to answer this from the knowledge base."

    return {
        "answer": text,
        "confidence": conf,
        "sources": sorted({h["metadata"].get("source", "unknown") for h in reranked}),
        "needs_review": conf < CONF_THRESHOLD,
        "is_verdict": False,
    }


def classify_code(query: str) -> dict:
    """
    Retrieval-first occupation / industry / crop coding.

    LLM is structurally excluded from this function.
    Low confidence (< CONF_THRESHOLD) sets fallback_to_nic=True so the
    caller can hit the MoSPI DIID NIC search API before routing to human.
    is_verdict is ALWAYS False.
    """
    pool = retrieval.retrieve(Bucket.CODING, query, RETRIEVE_K)
    reranked = reranker.rerank(query, pool, CONTEXT_K)

    suggestions = [
        {
            "code": h["metadata"].get("code"),
            "label": h["metadata"].get("label") or h["metadata"].get("title"),
            "code_type": h["metadata"].get("code_type"),
            "confidence": int(round(h.get("rnorm", h.get("fused", 0.0)) * 100)),
            "source": h["metadata"].get("external_source", "local"),
            "reason": (
                f"matched '{query}' → {h['metadata'].get('label', h['metadata'].get('title', ''))}"
            ),
        }
        for h in reranked
    ]

    top_conf = suggestions[0]["confidence"] if suggestions else 0

    return {
        "query": query,
        "suggestions": suggestions,
        "needs_review": top_conf < 80,
        "fallback_to_nic": top_conf < CONF_THRESHOLD,
        "is_verdict": False,
    }
