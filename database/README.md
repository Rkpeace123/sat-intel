# SATARK — NCO Code Database

## Contents

| File | Description |
|---|---|
| `dc256e06-...pdf` | NCO occupation codes PDF (source) |
| `nco_extracted.txt` | Full text extracted from the PDF |
| `nco_parsed.csv` | 325 parsed rows: code, label, family, sector, synonyms |
| `parse_nco.py` | Full ingest pipeline (PDF → PostgreSQL + ChromaDB) |
| `verify_fast.py` | Quick ChromaDB vector search test |
| `inspect_nco.py` | PDF structure inspection helper |

## Parsed data

**325 NCO codes** across sectors:
- Agriculture (Cultivator, Tea Plantation Worker, Bamboo Grower, ...)
- Capital Goods & Manufacturing (Bead Maker, Fitter, CNC Operator, ...)
- Construction (Carpenter, Plasterer, Plumber, Tile Setter, ...)
- Transport, Retail, Healthcare, IT, etc.

CSV format:
```
code,code_type,label,family,sector,synonyms
6111.0100,NCO,Cultivator - General,Field Crop and Vegetable Growers,Agriculture,cultivator|crop|field
7315.1000,NCO,Bead Maker (Glass),Glass Makers...,Capital Goods & Manufacturing,glass|bead|maker
```

## Run the ingest pipeline

```bash
# Start PostgreSQL first
docker compose up postgres -d

# Run from repo root
cd database
python parse_nco.py
```

Output:
- Inserts into `classification_codes` table (PostgreSQL)
- Embeds 325 chunks into ChromaDB `coding` collection
- The SATARK RAG coding engine then uses these for retrieval-first suggestions

## How it integrates with SATARK

```
Enumerator enters free text: "auto driver"
         ↓
NLP engine → intent: "occupation"
         ↓
classify_code("auto driver")
         ↓
ChromaDB vector search → top-5 NCO codes (e.g. 8322.0100 Motor Vehicle Driver)
         ↓
BGE cross-encoder reranks
         ↓
Returns: [{code, label, confidence, reason}]  — is_verdict: False
         ↓
DPD officer confirms or overrides
```

## Add more code sets

Follow the same pattern for NIC (industry), ISIC, COICOP:

```bash
# For NIC industry codes:
# 1. Add NIC PDF to database/
# 2. Copy parse_nco.py → parse_nic.py, change code_type to "NIC"
# 3. Run: python parse_nic.py
```

Each code type gets its own `code_type` value in `classification_codes`
and the same ChromaDB `coding` collection (differentiated by metadata).
