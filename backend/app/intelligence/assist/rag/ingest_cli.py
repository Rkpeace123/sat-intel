"""
CLI ingest entry point — called from scripts/start.sh at container boot.

Usage:
    python -m app.intelligence.assist.rag.ingest_cli
    python -m app.intelligence.assist.rag.ingest_cli --bucket coding
    python -m app.intelligence.assist.rag.ingest_cli --bucket survey_generation
"""
from __future__ import annotations

import asyncio
import sys

from app.intelligence.assist.rag.config import DOC_BUCKETS, Bucket
from app.intelligence.assist.rag.ingest import ingest_folder


async def main() -> None:
    bucket_arg = None
    if "--bucket" in sys.argv:
        idx = sys.argv.index("--bucket")
        if idx + 1 < len(sys.argv):
            bucket_arg = sys.argv[idx + 1]

    if bucket_arg:
        try:
            b = Bucket(bucket_arg)
        except ValueError:
            print(f"Unknown bucket: {bucket_arg}. Valid: {[b.value for b in Bucket]}")
            sys.exit(1)
        count = ingest_folder(b)
        print(f"  ✓ ingested {count} chunks into '{b.value}'")
    else:
        # Ingest all doc buckets (coding bucket needs DB → skipped here)
        total = 0
        for b in DOC_BUCKETS:
            count = ingest_folder(b)
            total += count
            if count:
                print(f"  ✓ {b.value}: {count} chunks")
        if total == 0:
            print("  (no documents found in data/kb/ — add PDFs/TXTs to ingest)")
        else:
            print(f"  ✓ total ingested: {total} chunks")


if __name__ == "__main__":
    asyncio.run(main())
