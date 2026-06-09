"""Inspect the Districts PDF structure."""
import fitz
from pathlib import Path

p = Path(__file__).parent / "Districts of All States of India.pdf"
pdf = fitz.open(str(p))
text = "".join(page.get_text() for page in pdf)
print(f"Pages: {len(pdf)}  |  Chars: {len(text):,}")
print("\n--- First 3000 chars ---")
print(text[:3000])
(p.parent / "districts_extracted.txt").write_text(text, encoding="utf-8")
print("\nSaved: districts_extracted.txt")
