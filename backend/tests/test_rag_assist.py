"""
Phase 3: RAG assist layer tests.

Heavy dependencies (sentence_transformers, chromadb) are mocked at session
level in conftest.py — tests collect and run without model downloads.

Integration tests (@pytest.mark.integration) require:
  docker compose up + python -m data.seed.rbac_seed + ingest_all()
"""
import pytest


# ── Chunking (pure Python, no deps) ──────────────────────────────────────────

class TestChunking:
    def test_chunk_document_small_text(self):
        from app.intelligence.assist.rag.chunking import chunk_document
        chunks = chunk_document("Short text.", "test.txt", "policy")
        assert len(chunks) == 1
        assert chunks[0]["id"] == "test.txt:0"
        assert chunks[0]["metadata"]["bucket"] == "policy"

    def test_chunk_document_large_text(self):
        from app.intelligence.assist.rag.chunking import chunk_document
        big = "word " * 1000
        chunks = chunk_document(big, "big.txt", "validation", size=900, overlap=150)
        assert len(chunks) > 1
        for c in chunks:
            assert "id" in c and "text" in c and "metadata" in c

    def test_chunk_records_text_format(self):
        from app.intelligence.assist.rag.chunking import chunk_records
        records = [
            {"code": "1234", "code_type": "NIC", "label": "Software development",
             "synonyms": ["IT", "programming"], "external_source": None}
        ]
        chunks = chunk_records(records, "coding")
        assert len(chunks) == 1
        assert "1234" in chunks[0]["text"]
        assert "Software development" in chunks[0]["text"]
        assert chunks[0]["id"] == "NIC:1234"
        # ChromaDB requires all metadata values to be scalar
        for v in chunks[0]["metadata"].values():
            assert isinstance(v, (str, int, float, bool)), f"non-scalar metadata: {v!r}"

    def test_chunk_records_no_synonyms(self):
        from app.intelligence.assist.rag.chunking import chunk_records
        records = [{"code": "5678", "code_type": "NCO", "label": "Farm worker",
                    "synonyms": [], "external_source": "MoSPI NIC"}]
        chunks = chunk_records(records, "coding")
        assert "Farm worker" in chunks[0]["text"]

    def test_overlap_pads_chunk_count(self):
        from app.intelligence.assist.rag.chunking import chunk_document
        text = "".join(f"sentence number {i}. " for i in range(200))
        with_ov = chunk_document(text, "f.txt", "policy", size=200, overlap=50)
        no_ov   = chunk_document(text, "f.txt", "policy", size=200, overlap=0)
        assert len(with_ov) >= len(no_ov)


# ── classify_code — structural contracts ─────────────────────────────────────

class TestClassifyCodeContract:
    """LLM is structurally excluded. is_verdict must ALWAYS be False."""

    def test_is_verdict_always_false(self):
        from app.intelligence.assist.rag.service import classify_code
        res = classify_code("auto driver")
        assert res["is_verdict"] is False

    def test_response_shape(self):
        from app.intelligence.assist.rag.service import classify_code
        res = classify_code("paddy farmer")
        assert "query" in res
        assert "suggestions" in res
        assert "needs_review" in res
        assert "fallback_to_nic" in res
        assert res["is_verdict"] is False

    def test_empty_result_sets_review_and_fallback(self):
        from app.intelligence.assist.rag.service import classify_code
        res = classify_code("xyzzy unknown")
        # With mocked empty store: no suggestions → needs_review + fallback_to_nic
        if not res["suggestions"]:
            assert res["needs_review"] is True
            assert res["fallback_to_nic"] is True

    def test_suggestions_have_required_fields(self):
        from app.intelligence.assist.rag.service import classify_code
        res = classify_code("school teacher")
        for s in res.get("suggestions", []):
            assert "code" in s
            assert "confidence" in s
            assert "reason" in s

    def test_confidence_bounded_0_100(self):
        from app.intelligence.assist.rag.service import classify_code
        res = classify_code("nurse")
        for s in res.get("suggestions", []):
            assert 0 <= s["confidence"] <= 100


# ── answer() — structural contracts ──────────────────────────────────────────

class TestAnswerContract:
    @pytest.mark.asyncio
    async def test_is_verdict_always_false(self):
        from app.intelligence.assist.rag.service import answer
        from app.intelligence.assist.rag.config import Bucket
        res = await answer(Bucket.POLICY, "2099 GDP forecast?")
        assert res["is_verdict"] is False

    @pytest.mark.asyncio
    async def test_empty_corpus_needs_review(self):
        from app.intelligence.assist.rag.service import answer
        from app.intelligence.assist.rag.config import Bucket
        res = await answer(Bucket.SURVEY_GEN, "describe marriage question")
        assert res["is_verdict"] is False
        # Mocked store returns no hits → confidence 0 → needs_review True
        assert res["needs_review"] is True

    @pytest.mark.asyncio
    async def test_shape(self):
        from app.intelligence.assist.rag.service import answer
        from app.intelligence.assist.rag.config import Bucket
        res = await answer(Bucket.VALIDATION, "income range for urban households")
        assert "answer" in res
        assert isinstance(res["confidence"], int)
        assert 0 <= res["confidence"] <= 100
        assert isinstance(res["sources"], list)
        assert res["is_verdict"] is False

    @pytest.mark.asyncio
    async def test_confidence_score_formula(self):
        """_confidence with empty reranked list must return 0."""
        from app.intelligence.assist.rag.service import _confidence
        assert _confidence([], "some answer") == 0

    @pytest.mark.asyncio
    async def test_insufficient_evidence_caps_confidence(self):
        from app.intelligence.assist.rag.service import _confidence
        fake_hit = {"rnorm": 1.0, "fused": 1.0}
        conf = _confidence([fake_hit] * 5, "INSUFFICIENT_EVIDENCE blah")
        assert conf <= 35


# ── Integration (require live stack) ─────────────────────────────────────────

@pytest.mark.integration
class TestIntegration:
    @pytest.mark.asyncio
    async def test_coding_returns_ranked_results_after_ingest(self):
        from app.intelligence.assist.rag.service import classify_code
        res = classify_code("auto driver")
        assert len(res["suggestions"]) > 0
        assert res["suggestions"][0]["confidence"] > 0

    @pytest.mark.asyncio
    async def test_policy_answer_with_real_kb(self):
        from app.intelligence.assist.rag.service import answer
        from app.intelligence.assist.rag.config import Bucket
        res = await answer(Bucket.POLICY, "What is PLFS?")
        assert res["confidence"] > 0
        assert len(res["sources"]) > 0
