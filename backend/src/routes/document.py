"""
Document handling routes.
"""
from fastapi import APIRouter, HTTPException, Depends, File, UploadFile, Form
from fastapi.responses import FileResponse
from datetime import datetime
from typing import Optional, Any
import os
import shutil
import re
import json

from ..services.auth_dependencies import get_current_user
from ..models.user import UserResponse
from ..models.schemas import DocumentResponse, EditRequest, ExportRequest

router = APIRouter(tags=["documents"])

# Services (will be set by main app)
document_service: Any = None
vector_service: Any = None
document_agent: Any = None


def set_services(doc_service: Any, vec_service: Any, doc_agent: Any) -> None:
    """Set the service instances."""
    global document_service, vector_service, document_agent
    document_service = doc_service
    vector_service = vec_service
    document_agent = doc_agent


@router.post("/api/upload")
async def upload_document(
    file: UploadFile = File(...),
    session_id: Optional[str] = Form(None)
):
    """Upload and process a document."""
    try:
        file_path = f"data/uploads/{file.filename}"
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        doc_data = await document_service.process_document(file_path)
        
        extracted_text = await document_service.extract_text_with_ocr(file_path)
        if not extracted_text and doc_data.get("pages"):
            first_page = doc_data["pages"][0]
            if isinstance(first_page, dict):
                extracted_text = first_page.get("text_content", "")
        
        if file.filename and file.filename.lower().endswith(('.docx', '.doc')):
            metadata = doc_data.get("metadata", {})
            html_content = metadata.get("html_content", "")
            if html_content:
                doc_data["html_content"] = html_content
                print(f"✅ DOCX converted to HTML ({len(html_content)} chars)")
        
        await document_service.update_document_text_content(doc_data["document_id"], extracted_text)
        await vector_service.add_document(doc_data["document_id"], extracted_text)

        doc_data["metadata"] = dict(doc_data.get("metadata", {}))
        doc_data["extracted_text"] = extracted_text
        doc_data["content"] = doc_data.get("html_content") or extracted_text

        if session_id:
            await document_service.attach_document_to_session(session_id, doc_data["document_id"])
            doc_data["session_id"] = session_id
            doc_data["metadata"]["session_id"] = session_id

        return DocumentResponse(**doc_data)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Document processing failed: {str(e)}")


@router.post("/api/edit")
async def edit_document(edit_request: EditRequest):
    """Edit document based on AI suggestions."""
    try:
        edit_result = await document_agent.process_edit_request(edit_request)
        
        updated_doc = await document_service.apply_edits(
            edit_request.document_id,
            edit_result["changes"]
        )
        
        return {
            "success": True,
            "changes": edit_result["changes"],
            "preview": edit_result["preview"],
            "document": updated_doc
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Document edit failed: {str(e)}")


@router.post("/api/export")
async def export_document(export_request: ExportRequest):
    """Export document in specified format."""
    try:
        export_path = await document_service.export_document(
            export_request.document_id,
            export_request.format,
            export_request.filename
        )
        
        return FileResponse(
            export_path,
            media_type="application/octet-stream",
            filename=os.path.basename(export_path)
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")


@router.post("/api/document/convert_to_docx")
async def convert_text_to_docx(request: dict):
    """Convert raw markdown/text content to DOCX and return file path."""
    try:
        content = request.get("content", "")
        raw_filename = request.get("filename")

        if raw_filename:
            filename = os.path.basename(raw_filename)
            name, ext = os.path.splitext(filename)
            if not name:
                name = f"generated_{int(datetime.now().timestamp())}"
            safe_name = re.sub(r'[^A-Za-z0-9._-]', '_', name)
            safe_ext = ext if ext and ext.lower() == '.docx' else '.docx'
            filename = f"{safe_name}{safe_ext}"
        else:
            filename = f"Generated_{int(datetime.now().timestamp())}.docx"

        exports_dir = os.path.join("data", "exports")
        os.makedirs(exports_dir, exist_ok=True)

        base, ext = os.path.splitext(filename)
        candidate = filename
        counter = 1
        while os.path.exists(os.path.join(exports_dir, candidate)):
            candidate = f"{base}_{counter}{ext}"
            counter += 1

        export_path = os.path.join(exports_dir, candidate)

        await document_service.export_text_to_docx(content, export_path)

        return {"path": export_path, "filename": candidate, "url": f"/exports/{candidate}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Conversion to DOCX failed: {str(e)}")


@router.get("/api/get_doc")
async def get_markdown_document():
    """Get the generated Markdown document."""
    try:
        md_file_path = os.path.join("data", "exports", "generated_doc.md")
        
        if not os.path.exists(md_file_path):
            raise HTTPException(status_code=404, detail="Markdown document not found. Generate content first.")
        
        with open(md_file_path, "r", encoding="utf-8") as f:
            markdown_content = f.read()
        
        return {
            "content": markdown_content,
            "filename": "generated_doc.md",
            "timestamp": datetime.fromtimestamp(os.path.getmtime(md_file_path)).isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read Markdown document: {str(e)}")


@router.post("/api/generate")
async def generate_markdown_document(request: dict):
    """Generate a new Markdown document from a query."""
    # Import at module level would cause circular import
    from ..services.llm_service import LLMService
    
    # Get llm_service from parent module
    import sys
    main_module = sys.modules.get('main') or sys.modules.get('__main__')
    llm_service = getattr(main_module, 'llm_service', None) if main_module else None
    
    try:
        query = request.get("query", "")
        
        if not query.strip():
            raise HTTPException(status_code=400, detail="Query cannot be empty")
        
        print(f"📝 Generating Markdown document from query: {query}")
        
        if not llm_service or not llm_service.is_initialized:
            raise HTTPException(status_code=503, detail="LLM service not available")
        
        system_prompt = (
            "You are a professional document writer. "
            "Return only valid Markdown (.md) content with proper structure: "
            "- Use # for main title, ## for sections, ### for subsections "
            "- Use ** for bold, * for italic "
            "- Use - or * for bullet lists, 1. for numbered lists "
            "- Use > for blockquotes "
            "- Use ``` for code blocks "
            "Do not include any explanations or conversational text. "
            "Output should be pure, well-formatted Markdown ready to render."
        )
        
        response = await llm_service.generate_response(
            query,
            context=None,
            system_prompt=system_prompt,
            temperature=0.7
        )
        
        markdown_content = response.content
        
        md_file_path = os.path.join("data", "exports", "generated_doc.md")
        os.makedirs(os.path.dirname(md_file_path), exist_ok=True)
        
        with open(md_file_path, "w", encoding="utf-8") as f:
            f.write(markdown_content)
        
        print(f"✅ Generated and saved Markdown to: {md_file_path}")
        
        return {
            "content": markdown_content,
            "filename": "generated_doc.md",
            "timestamp": datetime.now().isoformat(),
            "message": "Markdown document generated successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Generate error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate Markdown: {str(e)}")


@router.post("/api/session/{session_id}/document/content")
async def update_session_document_content(session_id: str, request: dict):
    """Update the document content for a session."""
    try:
        import aiosqlite
        import uuid
        
        content = request.get("content", "")
        html_content = request.get("html_content", content)
        
        session = await document_service.get_session_by_id(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        document_id = session.get("document_id")
        
        if not document_id:
            document_id = f"doc_{uuid.uuid4().hex[:12]}"
            
            doc_data = {
                "filename": f"Session Document - {session.get('name', 'Untitled')}.html",
                "file_type": "html",
                "content": content,
                "html_content": html_content,
                "extracted_text": content,
                "page_count": 1,
                "pages": [],
                "metadata": {
                    "source": "editor",
                    "session_id": session_id,
                    "html_content": html_content,
                    "plain_text": content
                }
            }
            
            await document_service._store_document_metadata(document_id, doc_data["filename"], doc_data["file_type"], doc_data)
            
            document_service.documents_cache[document_id] = doc_data
            
            await document_service.attach_document_to_session(session_id, document_id)
            
            return {
                "status": "created",
                "document_id": document_id,
                "session_id": session_id
            }
        
        try:
            async with aiosqlite.connect(document_service.db_path) as db:
                cursor = await db.execute(
                    "SELECT metadata FROM documents WHERE id = ?",
                    (document_id,)
                )
                row = await cursor.fetchone()
                
                if row:
                    metadata = json.loads(row[0]) if row[0] else {}
                    metadata["html_content"] = html_content
                    metadata["plain_text"] = content
                    
                    await db.execute(
                        """
                        UPDATE documents
                        SET extracted_text = ?, metadata = ?
                        WHERE id = ?
                        """,
                        (content, json.dumps(metadata), document_id)
                    )
                    await db.commit()
                    
                    if document_id in document_service.documents_cache:
                        document_service.documents_cache[document_id]["html_content"] = html_content
                        document_service.documents_cache[document_id]["content"] = html_content
                        document_service.documents_cache[document_id]["extracted_text"] = content
                    
                    return {
                        "status": "updated",
                        "document_id": document_id,
                        "session_id": session_id
                    }
                else:
                    raise HTTPException(status_code=404, detail="Document not found in database")
                    
        except Exception as e:
            print(f"Error updating document content: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to update document: {str(e)}")
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error updating session document content: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update document content: {str(e)}")
