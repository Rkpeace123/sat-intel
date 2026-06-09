"""Fast NCO verification — vector search only (no cross-encoder)."""
import sys, os
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))
os.environ.setdefault("ANONYMIZED_TELEMETRY", "False")

from app.intelligence.assist.rag.config import Bucket
from app.intelligence.assist.rag.embeddings import embed_one
from app.intelligence.assist.rag.store import query, all_docs

# Count docs in coding collection
docs = all_docs(Bucket.CODING)
print(f"Coding collection: {len(docs)} documents in ChromaDB")
print()

# Quick vector search — no reranker
queries = [
    "auto driver",
    "paddy farmer",
    "tea stall",
    "software developer",
    "nurse healthcare",
    "carpenter wood",
]

print(f"{'Query':<28} {'Code':<16} {'Label':<40} {'Score':>6}")
print("-" * 95)
for q in queries:
    vec = embed_one(q)
    hits = query(Bucket.CODING, vec, k=3)
    if hits:
        top = hits[0]
        code = top["metadata"].get("code","?")
        label = top["metadata"].get("label","?")[:38]
        score = top.get("vscore", 0)
        print(f"{q:<28} {code:<16} {label:<40} {score:>5.3f}")
    else:
        print(f"{q:<28} (no results)")
