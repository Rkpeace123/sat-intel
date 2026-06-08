from enum import Enum

from app.config import settings


class Bucket(str, Enum):
    SURVEY_GEN = "survey_generation"
    CODING     = "coding"
    VALIDATION = "validation"
    TRUST      = "trust"
    POLICY     = "policy"


# Buckets that are populated from DB records (classification_codes table)
RECORD_BUCKETS = {Bucket.CODING}

# Buckets that are populated from documents in data/kb/
DOC_BUCKETS = {Bucket.SURVEY_GEN, Bucket.VALIDATION, Bucket.TRUST, Bucket.POLICY}

RETRIEVE_K     = 20    # hybrid pool size before reranking
CONTEXT_K      = 5     # top-N after reranking passed to LLM / returned as suggestions
EMBED_MODEL    = settings.embed_model
RERANKER_MODEL = settings.reranker_model
CHROMA_DIR     = settings.chroma_dir
CONF_THRESHOLD = settings.conf_threshold
