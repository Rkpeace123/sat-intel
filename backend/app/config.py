from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "SATARK Intelligence Layer"

    # ── Database ──────────────────────────────────────────────────────────────
    database_url: str = "postgresql+asyncpg://satark:satark@localhost:5432/satark"

    # ── Redis ─────────────────────────────────────────────────────────────────
    redis_url: str = "redis://localhost:6379/0"

    # ── Vector store ──────────────────────────────────────────────────────────
    chroma_dir: str = "data/chroma"

    # ── Security ──────────────────────────────────────────────────────────────
    jwt_secret: str = "change-me-in-prod"
    jwt_alg: str = "HS256"
    jwt_expire_minutes: int = 720

    # ── Assist lane ───────────────────────────────────────────────────────────
    embed_model: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    reranker_model: str = "BAAI/bge-reranker-base"
    ollama_url: str = "http://localhost:11434"
    gemma_model: str = "gemma2:2b"

    # ── MoSPI DIID NIC semantic-search (production; blank = local dev) ────────
    diid_nic_url: str = ""

    # ── Sarvam voice (production; blank = local dev) ──────────────────────────
    sarvam_api_key: str = ""

    # ── Intelligence thresholds ───────────────────────────────────────────────
    conf_threshold: int = 70   # below this → route to human reviewer (DPD)

    @property
    def trust_weights(self) -> dict[str, float]:
        """Verdict lane weighted aggregation (must sum to 1.0)."""
        return {
            "validation": 0.40,
            "fraud": 0.30,
            "evidence": 0.15,
            "behaviour": 0.15,
        }


settings = Settings()
