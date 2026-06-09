"""Verify the NCO RAG coding engine returns sensible suggestions."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))
import os; os.environ.setdefault("ANONYMIZED_TELEMETRY","False")

from app.intelligence.assist.rag.service import classify_code

queries = [
    "auto driver",
    "tea stall operator",
    "paddy farmer",
    "software engineer",
    "nurse",
    "brick layer construction",
    "carpenter general",
    "electrical fitter",
    "I run a kirana shop",
]

print("NCO Coding Engine — RAG suggestions\n")
print(f"{'Query':<35} {'Top suggestion':<45} {'Conf':>5}")
print("-" * 90)

for q in queries:
    result = classify_code(q)
    sugg = result["suggestions"]
    if sugg:
        top = sugg[0]
        print(f"{q:<35} {top['code']} — {(top['label'] or '')[:38]:<42} {top['confidence']:>4}%")
    else:
        print(f"{q:<35} {'(no results)':<45}")
