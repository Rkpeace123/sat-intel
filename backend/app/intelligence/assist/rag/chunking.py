"""
Text chunking for RAG ingestion.

chunk_document  — recursive splitter for PDF/text docs (doc buckets)
chunk_records   — one chunk per classification code row (coding bucket)
"""
from app.intelligence.assist.rag.config import Bucket  # noqa: F401 — re-exported for ingest

_SEPS = ["\n\n", "\n", ". ", " "]


def _split(text: str, size: int, overlap: int, seps: list[str] | None = None) -> list[str]:
    seps = _SEPS if seps is None else seps
    text = text.strip()
    if len(text) <= size or not seps:
        return [text] if text else []

    sep, rest = seps[0], seps[1:]
    out: list[str] = []
    buf = ""

    for p in text.split(sep):
        piece = (buf + sep + p) if buf else p
        if len(piece) <= size:
            buf = piece
        else:
            if buf:
                out.append(buf)
            if len(p) > size:
                out.extend(_split(p, size, overlap, rest))
                buf = ""
            else:
                buf = p

    if buf:
        out.append(buf)

    # Prefix each chunk (except first) with the tail of the previous for overlap
    if overlap and len(out) > 1:
        out = [out[0]] + [
            out[i - 1][-overlap:] + " " + out[i] for i in range(1, len(out))
        ]

    return [c for c in out if c.strip()]


def chunk_document(
    text: str,
    source: str,
    bucket: str,
    size: int = 900,
    overlap: int = 150,
) -> list[dict]:
    return [
        {
            "id": f"{source}:{i}",
            "text": c,
            "metadata": {"source": source, "bucket": bucket, "chunk": i},
        }
        for i, c in enumerate(_split(text, size, overlap))
    ]


def chunk_records(records: list[dict], bucket: str) -> list[dict]:
    """
    One vector per classification code row.
    Text format: "<code> — <label>. Also known as: <synonyms>."
    """
    out = []
    for r in records:
        syn = ", ".join(r.get("synonyms", []))
        text = f"{r['code']} — {r['label']}. Also known as: {syn}."
        # Only scalar values are valid ChromaDB metadata
        meta = {k: v for k, v in r.items() if isinstance(v, (str, int, float, bool))}
        meta.update(
            {
                "bucket": bucket,
                "source": f"{r.get('code_type', 'CODE')}_master",
            }
        )
        out.append(
            {
                "id": f"{r.get('code_type', 'C')}:{r['code']}",
                "text": text,
                "metadata": meta,
            }
        )
    return out
