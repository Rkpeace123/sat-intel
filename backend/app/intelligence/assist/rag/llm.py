"""
Gemma via Ollama — ASSIST LANE ONLY.

This module must NEVER be imported from:
  - app/intelligence/orchestrator.py
  - app/intelligence/verdict/
  - any code on the accept/reject path

The system prompt explicitly bars verdict decisions.
"""
import httpx

from app.config import settings

_SYSTEM = (
    "You are SATARK's assist layer for India's official statistics. "
    "Answer ONLY from the provided context. If the context lacks the answer, reply "
    "exactly INSUFFICIENT_EVIDENCE. Never invent facts, numbers, or citations. "
    "Never make an accept/reject decision about any respondent's data — only explain, "
    "draft, or suggest."
)


async def generate(task: str, context: str, max_tokens: int = 320) -> str:
    prompt = f"{_SYSTEM}\n\nContext:\n{context}\n\nTask: {task}\n\nAnswer:"
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.post(
            f"{settings.ollama_url}/api/generate",
            json={
                "model": settings.gemma_model,
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": 0, "num_predict": max_tokens},
            },
        )
        r.raise_for_status()
        return r.json().get("response", "").strip()
