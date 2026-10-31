"""Upload, load, save and export documents."""
import asyncio
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile

from ..db import documents, sessions
from ..deps import get_current_user, owned_session
from ..models.schemas import DocumentContentRequest, DocumentResponse, ExportDocxRequest
from ..models.user import UserResponse
from ..services.documents.export import docx_bytes, export_filename
from ..services.documents.ingest import ingest_upload

router = APIRouter(tags=["documents"])

DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


@router.get("/api/documents")
async def list_documents(user: UserResponse = Depends(get_current_user)):
    return {"documents": await documents.list_for_user(user.id)}


@router.post("/api/upload", response_model=DocumentResponse)
async def upload(file: UploadFile = File(...), session_id: Optional[str] = Form(None),
                 user: UserResponse = Depends(get_current_user)):
    if session_id and not await sessions.get_owned(session_id, user.id):
        raise HTTPException(status_code=404, detail="Session not found")
    return await ingest_upload(file, user.id, session_id)


@router.get("/api/session/{session_id}/document")
async def session_document(session: dict = Depends(owned_session)):
    if not session["document_id"]:
        return {"document": None, "message": "No document linked to session"}
    return {"document": await documents.get(session["document_id"])}


@router.post("/api/session/{session_id}/document/content")
async def save_session_document(request: DocumentContentRequest, session: dict = Depends(owned_session)):
    html = request.html_content if request.html_content is not None else request.content
    document_id = session["document_id"]
    if document_id:
        await documents.update_content(document_id, request.content, html)
        return {"status": "updated", "document_id": document_id, "session_id": session["id"]}

    document_id = f"doc_{uuid.uuid4().hex[:12]}"
    await documents.insert(document_id, session["user_id"], f"{session['name']}.html", "html", 1,
                           request.content, html, {"source": "editor"})
    await sessions.attach_document(session["id"], document_id)
    return {"status": "created", "document_id": document_id, "session_id": session["id"]}


@router.post("/api/document/convert_to_docx")
async def convert_to_docx(request: ExportDocxRequest, _: UserResponse = Depends(get_current_user)):
    filename = export_filename(request.filename)
    try:
        data = await asyncio.to_thread(docx_bytes, request.content)
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Conversion to DOCX failed: {error}")
    return Response(data, media_type=DOCX_TYPE, headers={"Content-Disposition": f'attachment; filename="{filename}"'})
