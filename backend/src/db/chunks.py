"""Queries for document_chunks: pgvector embeddings used for semantic search."""
import uuid
from typing import List, Sequence, Tuple

from .database import fetch, pool


def _vector(values: Sequence[float]) -> str:
    return "[" + ",".join(f"{value:.7g}" for value in values) + "]"


async def replace(document_id: str, model: str, chunks: List[Tuple[str, Sequence[float]]], text_hash: str) -> None:
    async with pool().acquire() as connection, connection.transaction():
        await connection.execute("DELETE FROM document_chunks WHERE document_id = $1", document_id)
        await connection.executemany(
            """INSERT INTO document_chunks (id, document_id, chunk_index, content, model, embedding)
               VALUES ($1, $2, $3, $4, $5, $6::vector)""",
            [(str(uuid.uuid4()), document_id, i, content, model, _vector(embedding))
             for i, (content, embedding) in enumerate(chunks)],
        )
        await connection.execute("UPDATE documents SET indexed_hash = $2 WHERE id = $1", document_id, text_hash)


async def search(document_id: str, model: str, embedding: Sequence[float], limit: int) -> List[Tuple[str, float]]:
    rows = await fetch(
        """SELECT content, 1 - (embedding <=> $3::vector) AS score FROM document_chunks
           WHERE document_id = $1 AND model = $2
           ORDER BY embedding <=> $3::vector LIMIT $4""",
        document_id, model, _vector(embedding), limit,
    )
    return [(row["content"], float(row["score"])) for row in rows]


async def search_many(document_ids: List[str], model: str, embedding: Sequence[float], limit: int) -> List[dict]:
    rows = await fetch(
        """SELECT c.document_id, d.filename, c.content, 1 - (c.embedding <=> $3::vector) AS score
           FROM document_chunks c JOIN documents d ON d.id = c.document_id
           WHERE c.document_id = ANY($1::text[]) AND c.model = $2
           ORDER BY c.embedding <=> $3::vector LIMIT $4""",
        document_ids, model, _vector(embedding), limit,
    )
    return [{**dict(row), "score": float(row["score"])} for row in rows]
