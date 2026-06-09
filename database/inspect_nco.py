"""Inspect the NCO PDF to understand its structure."""
import fitz
import re

PDF_PATH = "dc256e06-7977-4b01-9cef-832b9b9b8f14.pdf"

pdf = fitz.open(PDF_PATH)
print(f"Pages: {len(pdf)}")

# Extract all text
text = ""
for page in pdf:
    text += page.get_text()

print(f"Total chars: {len(text)}")
print("\n--- First 3000 chars ---")
print(text[:3000])
print("\n--- Chars 3000-6000 ---")
print(text[3000:6000])

# Save full text for inspection
with open("nco_extracted.txt", "w", encoding="utf-8") as f:
    f.write(text)
print("\nSaved to nco_extracted.txt")
