"""Parse an uploaded file and store its text and HTML for the user."""
import asyncio
import uuid
from pathlib import Path
from typing import Optional

from fastapi import HTTPException, UploadFile

from ...config import settings
from ...db import documents, sessions
from ...models.schemas import DocumentResponse
from .parsers import SUPPORTED_TYPES, DocumentTooLarge, parse_document

READ_CHUNK = 1024 * 1024


async def _read_limited(file: UploadFile) -> bytes:
    limit = settings.max_upload_mb * 1024 * 1024
    data = bytearray()
    while chunk := await file.read(READ_CHUNK):
        data += chunk
        if len(data) > limit:
            raise HTTPException(status_code=413, detail=f"Files must be {settings.max_upload_mb} MB or smaller")
    return bytes(data)


async def ingest_upload(file: UploadFile, user_id: str, session_id: Optional[str]) -> DocumentResponse:
    filename = Path(file.filename or "upload").name
    file_type = Path(filename).suffix.lstrip(".").lower()
    if file_type not in SUPPORTED_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file_type or 'unknown'}")

    data = await _read_limited(file)
    try:
        parsed = await asyncio.to_thread(parse_document, data, file_type)
    except DocumentTooLarge as error:
        raise HTTPException(status_code=413, detail=str(error))
    except Exception:
        raise HTTPException(status_code=400, detail="The file could not be read. Is it a valid document?")

    document_id = str(uuid.uuid4())
    await documents.insert(document_id, user_id, filename, file_type, parsed.page_count, parsed.text, parsed.html, {})
    if session_id:
        await sessions.attach_document(session_id, document_id)

    return DocumentResponse(
        document_id=document_id,
        filename=filename,
        file_type=file_type,
        page_count=parsed.page_count,
        extracted_text=parsed.text,
        html_content=parsed.html,
        content=parsed.html or parsed.text,
        session_id=session_id,
        pages=[{"page_number": n, "text_content": text} for n, text in enumerate(parsed.pages, start=1)],
        metadata={"session_id": session_id} if session_id else {},
    )
