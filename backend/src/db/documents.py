"""Queries for the documents table."""
from typing import List, Optional

from .database import execute, fetch, fetchrow, fetchval, iso


async def insert(document_id: str, user_id: str, filename: str, file_type: str, page_count: int,
                 text: str, html: Optional[str], metadata: dict) -> None:
    await execute(
        """INSERT INTO documents (id, user_id, filename, file_type, page_count, text, html, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)""",
        document_id, user_id, filename, file_type, page_count, text, html, metadata,
    )


async def get(document_id: str) -> Optional[dict]:
    row = await fetchrow("SELECT * FROM documents WHERE id = $1", document_id)
    if not row:
        return None
    return {
        "document_id": row["id"],
        "filename": row["filename"],
        "file_type": row["file_type"],
        "page_count": row["page_count"],
        "extracted_text": row["text"],
        "html_content": row["html"],
        "content": row["html"] or row["text"],
        "pages": [],
        "metadata": row["metadata"] or {},
        "created_at": iso(row["created_at"]),
    }


async def owner(document_id: str) -> Optional[str]:
    return await fetchval("SELECT user_id FROM documents WHERE id = $1", document_id)


async def update_content(document_id: str, text: str, html: str) -> None:
    await execute(
        "UPDATE documents SET text = $2, html = $3, updated_at = now() WHERE id = $1",
        document_id, text, html,
    )


async def index_state(document_id: str) -> Optional[dict]:
    row = await fetchrow("SELECT text, indexed_hash FROM documents WHERE id = $1", document_id)
    return dict(row) if row else None


async def list_for_user(user_id: str, limit: int = 100) -> List[dict]:
    rows = await fetch(
        """SELECT id, filename, file_type, page_count, length(text) AS characters, created_at FROM documents
           WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2""",
        user_id, limit,
    )
    return [{**dict(row), "created_at": iso(row["created_at"])} for row in rows]


async def owned_ids(user_id: str, document_ids: Optional[List[str]], limit: int) -> List[str]:
    """The given documents that belong to the user, or their most recent ones when none are given."""
    if document_ids:
        rows = await fetch("SELECT id FROM documents WHERE user_id = $1 AND id = ANY($2::text[])", user_id, document_ids)
    else:
        rows = await fetch("SELECT id FROM documents WHERE user_id = $1 ORDER BY updated_at DESC LIMIT $2", user_id, limit)
    return [row["id"] for row in rows]


async def excerpts(document_ids: List[str], characters: int) -> List[dict]:
    rows = await fetch("SELECT id, filename, left(text, $2) AS excerpt FROM documents WHERE id = ANY($1::text[])",
                       document_ids, characters)
    return [dict(row) for row in rows]


async def texts(document_ids: List[str], characters: int) -> List[dict]:
    """Full text (up to a cap each) of the given documents, most recently edited first."""
    rows = await fetch(
        """SELECT id, filename, left(text, $2) AS text FROM documents WHERE id = ANY($1::text[])
           ORDER BY updated_at DESC""",
        document_ids, characters,
    )
    return [dict(row) for row in rows]
