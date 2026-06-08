import os

import chromadb

from app.intelligence.assist.rag.config import CHROMA_DIR, Bucket

# Silence ChromaDB telemetry noise
os.environ.setdefault("ANONYMIZED_TELEMETRY", "False")

_client = chromadb.PersistentClient(path=CHROMA_DIR)


def collection(bucket: Bucket):
    return _client.get_or_create_collection(
        bucket.value,
        metadata={"hnsw:space": "cosine"},
    )


def upsert(
    bucket: Bucket,
    ids: list[str],
    embeddings: list[list[float]],
    documents: list[str],
    metadatas: list[dict],
) -> None:
    if ids:
        collection(bucket).upsert(
            ids=ids,
            embeddings=embeddings,
            documents=documents,
            metadatas=metadatas,
        )


def query(bucket: Bucket, query_emb: list[float], k: int) -> list[dict]:
    res = collection(bucket).query(
        query_embeddings=[query_emb],
        n_results=k,
        include=["documents", "metadatas", "distances"],
    )
    if not res["ids"][0]:
        return []
    return [
        {
            "id": i,
            "text": d,
            "metadata": m,
            "vscore": round(1 - dist, 4),
        }
        for i, d, m, dist in zip(
            res["ids"][0],
            res["documents"][0],
            res["metadatas"][0],
            res["distances"][0],
        )
    ]


def all_docs(bucket: Bucket) -> list[dict]:
    res = collection(bucket).get(include=["documents", "metadatas"])
    return [
        {"id": i, "text": d, "metadata": m}
        for i, d, m in zip(res["ids"], res["documents"], res["metadatas"])
    ]
