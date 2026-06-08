"""
Gemma via Ollama wrapper (assist lane only).
NEVER called from the verdict lane or orchestrator.process().
"""
import httpx

from app.config import settings


async def generate(prompt: str, max_tokens: int = 512) -> str:
    """
    Call Ollama /api/generate with the configured Gemma model.
    Returns the generated text or raises httpx.HTTPError.
    Phase 10/11/12 will use this.
    """
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{settings.ollama_url}/api/generate",
            json={
                "model": settings.gemma_model,
                "prompt": prompt,
                "stream": False,
                "options": {"num_predict": max_tokens},
            },
        )
        resp.raise_for_status()
        return resp.json()["response"]
