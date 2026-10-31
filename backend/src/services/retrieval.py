"""Search over a document's chunks (RAG): semantic with embeddings, keyword ranking when no embedding model answers.

Embeddings re-index lazily whenever the text changed. Without a reachable embedding model the search used to return
nothing at all; now it falls back to ranking the same chunks by the question's words.
"""
import asyncio
import hashlib
import logging
import math
import re
from collections import Counter
from typing import Any, List, Optional, Sequence, Tuple

from ..db import chunks, documents
from ..models.schemas import VectorSearchResult
from .llm import LLMService

logger = logging.getLogger(__name__)

MAX_DOCUMENTS = 25
# Keyword ranking runs without an index, so it reads at most this much text per search (all documents together).
FALLBACK_TEXT_CHARS = 3_000_000
WORD = re.compile(r"[a-z0-9]{3,}")
STOP_WORDS = frozenset(
    "the and for are but not you all any can had her was one our out has have this that with what when where which "
    "who whom why how from they them their there then than into about does did doing over under also just only "
    "your yours been being will would should could tell show give list please document text".split()
)


def split_text(text: str, chunk_size: int = 1000, overlap: int = 200) -> List[str]:
    """Split text into overlapping chunks, preferring sentence boundaries."""
    if len(text) <= chunk_size:
        return [text]
    pieces, start = [], 0
    while start < len(text):
        end = start + chunk_size
        if end < len(text):
            for punctuation in (". ", "! ", "? ", "\n\n"):
                cut = text.rfind(punctuation, start, end)
                if cut > start + chunk_size // 2:
                    end = cut + len(punctuation)
                    break
        piece = text[start:end].strip()
        if piece:
            pieces.append(piece)
        if end >= len(text):
            break
        start = end - overlap
    return pieces


def keyword_rank(query: str, passages: Sequence[Tuple[Any, str]], limit: int) -> List[Tuple[Any, str, float]]:
    """Rank passages by the query's words (BM25-style weighting), scores scaled to 0-1."""
    terms = {word for word in WORD.findall(query.lower()) if word not in STOP_WORDS}
    if not terms or not passages:
        return []
    counts = [Counter(WORD.findall(text.lower())) for _, text in passages]
    rarity = {term: math.log(1 + len(passages) / (1 + sum(1 for c in counts if term in c))) for term in terms}
    scored = []
    for (key, text), count in zip(passages, counts):
        score = sum(rarity[term] * (1 + math.log(count[term])) for term in terms if count[term])
        if score:
            scored.append((key, text, score))
    if not scored:
        return []
    best = max(score for _, _, score in scored)
    scored.sort(key=lambda item: item[2], reverse=True)
    return [(key, text, round(score / best, 4)) for key, text, score in scored[:limit]]


class Retriever:
    def __init__(self, llm: LLMService):
        self.llm = llm
        self.warned = False

    def _fallback_notice(self, error: Exception) -> None:
        # Once per process: the log should say why answers come from keyword search, not repeat it every request.
        if not self.warned:
            logger.warning("Embedding model unavailable (%s); document search uses keyword ranking instead", error)
            self.warned = True

    async def _ensure_indexed(self, document_id: str) -> bool:
        state = await documents.index_state(document_id)
        if not state or not state["text"].strip():
            return False
        text_hash = hashlib.sha256(f"{self.llm.embedding.model}:{state['text']}".encode()).hexdigest()
        if state["indexed_hash"] != text_hash:
            pieces = split_text(state["text"])
            vectors = await self.llm.embed(pieces)
            await chunks.replace(document_id, self.llm.embedding.model, list(zip(pieces, vectors)), text_hash)
        return True

    async def search(self, query: str, document_id: str, limit: int = 4) -> List[VectorSearchResult]:
        try:
            if not await self._ensure_indexed(document_id):
                return []
            [query_vector] = await self.llm.embed([query])
            found = await chunks.search(document_id, self.llm.embedding.model, query_vector, limit)
        except Exception as error:
            self._fallback_notice(error)
            state = await documents.index_state(document_id)
            text = state["text"][:FALLBACK_TEXT_CHARS] if state and state["text"].strip() else ""
            ranked = await asyncio.to_thread(lambda: keyword_rank(query, list(enumerate(split_text(text))) if text else [], limit))
            found = [(content, score) for _, content, score in ranked]
        return [VectorSearchResult(content=content, score=score, metadata={"document_id": document_id})
                for content, score in found if score >= 0.1]

    async def search_many(self, query: str, user_id: str, document_ids: Optional[List[str]] = None,
                          limit: int = 6) -> List[dict]:
        """Search several of the user's documents (all recent ones when none are given)."""
        ids = await documents.owned_ids(user_id, document_ids, MAX_DOCUMENTS)
        try:
            indexed = [document_id for document_id in ids if await self._ensure_indexed(document_id)]
            if not indexed:
                return []
            [query_vector] = await self.llm.embed([query])
            found = await chunks.search_many(indexed, self.llm.embedding.model, query_vector, limit)
        except Exception as error:
            self._fallback_notice(error)
            found = await self._keyword_many(query, ids, limit)
        return [item for item in found if item["score"] >= 0.1]

    @staticmethod
    async def _keyword_many(query: str, document_ids: List[str], limit: int) -> List[dict]:
        rows, budget = [], FALLBACK_TEXT_CHARS
        for row in await documents.texts(document_ids, FALLBACK_TEXT_CHARS):
            text = (row["text"] or "")[:budget]
            budget -= len(text)
            rows.append((row["id"], row["filename"], text))

        def rank() -> List[Tuple[Any, str, float]]:
            passages = [((doc_id, name), piece) for doc_id, name, text in rows if text for piece in split_text(text)]
            return keyword_rank(query, passages, limit)

        # Splitting and ranking megabytes of text is CPU work; a thread keeps other requests responsive.
        return [{"document_id": key[0], "filename": key[1], "content": text, "score": score}
                for key, text, score in await asyncio.to_thread(rank)]
