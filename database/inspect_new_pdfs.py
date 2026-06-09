"""Inspect the two new PDFs to understand their structure."""
import fitz
from pathlib import Path

folder = Path(__file__).parent

new_pdfs = [
    "90ef44e4-c77a-45b5-aff2-d5be5e7057b8.pdf",
    "f44f13c8-cd1f-4aeb-bcfd-831f3795b9b2.pdf",
    "List of States.pdf",
]

for fname in new_pdfs:
    p = folder / fname
    if not p.exists():
        continue
    pdf = fitz.open(str(p))
    text = "".join(page.get_text() for page in pdf)
    print(f"\n{'='*60}")
    print(f"FILE: {fname}")
    print(f"Pages: {len(pdf)}  |  Chars: {len(text):,}")
    print(f"--- First 2000 chars ---")
    print(text[:2000])
    print(f"--- Chars 2000-3500 ---")
    print(text[2000:3500])
    # Save extracted text
    out = p.parent / (p.stem + "_extracted.txt")
    out.write_text(text, encoding="utf-8")
    print(f"\nSaved: {out.name}")
