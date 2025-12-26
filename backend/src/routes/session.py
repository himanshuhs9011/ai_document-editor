"""
Session management routes.
"""
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime
from typing import Optional, Any

from ..services.auth_dependencies import get_current_user
from ..models.user import UserResponse

router = APIRouter(tags=["sessions"])

# Services (will be set by main app)
document_service: Any = None


def set_document_service(service: Any) -> None:
    """Set the document service instance."""
    global document_service
    document_service = service


@router.post("/api/session/new")
async def create_new_session():
    """Create a new session."""
    import time
    import random
    import string
    
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    random_id = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
    session_id = f"session_{timestamp}_{random_id}"
    
    return {"session_id": session_id}


@router.get("/api/session/{session_id}/history")
async def get_session_history_simple(session_id: str):
    """Get session history for frontend compatibility."""
    try:
        messages = await document_service.get_session_messages(session_id)
        return {"messages": messages}
    except Exception as e:
        print(f"Error getting session history: {e}")
        return {"messages": []}


@router.get("/api/session/{session_id}/document")
async def get_session_document_simple(session_id: str):
    """Simple session document endpoint for frontend compatibility."""
    try:
        session = await document_service.get_session_by_id(session_id)
        if not session:
            return {"document": None, "message": "Session not found"}

        document_id = session.get("document_id")
        if not document_id:
            return {"document": None, "message": "No document linked to session"}

        document = await document_service.get_document_by_id(document_id)
        if not document:
            return {"document": None, "message": "Document not found"}

        return {"document": document}
    except Exception as e:
        print(f"Error retrieving session document: {e}")
        return {"document": None, "error": str(e)}


@router.post("/api/sessions")
async def create_session_endpoint(
    request: dict,
    current_user: UserResponse = Depends(get_current_user)
):
    """Create a new chat session (requires authentication)."""
    try:
        session_name = request.get("session_name") or request.get("name") or f"New Session {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        session_id = await document_service.create_session(session_name, user_id=current_user.id)
        
        return {
            "session_id": session_id,
            "name": session_name,
            "created_at": datetime.now().isoformat(),
            "status": "created",
            "user_id": current_user.id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create session: {str(e)}")


@router.get("/api/sessions")
async def get_sessions(current_user: UserResponse = Depends(get_current_user)):
    """Get all chat sessions for current user (requires authentication)."""
    try:
        print(f"🔍 Getting sessions for user: {current_user.username} ({current_user.id})")
        sessions = await document_service.get_all_sessions(user_id=current_user.id)
        print(f"📊 Retrieved {len(sessions)} sessions for user")
        
        for session in sessions:
            if not session.get("name"):
                session["name"] = f"Session {session.get('created_at', '')[:10]}"
            
            if session.get("created_at"):
                try:
                    dt = datetime.fromisoformat(session["created_at"].replace('Z', '+00:00'))
                    session["created_at_display"] = dt.strftime('%Y-%m-%d %H:%M')
                    if session.get("updated_at"):
                        dt_updated = datetime.fromisoformat(session["updated_at"].replace('Z', '+00:00'))
                        session["updated_at_display"] = dt_updated.strftime('%Y-%m-%d %H:%M')
                    else:
                        session["updated_at_display"] = session["created_at_display"]
                except:
                    session["created_at_display"] = "Unknown"
                    session["updated_at_display"] = "Unknown"
            else:
                session["created_at_display"] = "Unknown"
                session["updated_at_display"] = "Unknown"
        
        print(f"✅ Formatted sessions successfully")
        return {"sessions": sessions}
        
    except Exception as e:
        print(f"❌ Error in get_sessions: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to get sessions: {str(e)}")


@router.get("/api/sessions/{session_id}")
async def get_session_details(session_id: str):
    """Get session details and messages."""
    try:
        sessions = await document_service.get_all_sessions()
        session = next((s for s in sessions if s["id"] == session_id), None)
        
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        messages = await document_service.get_session_messages(session_id)
        
        return {
            "session": session,
            "messages": messages
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get session: {str(e)}")


@router.delete("/api/sessions/{session_id}")
async def delete_session_endpoint(
    session_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """Delete a session and its messages (requires authentication)."""
    try:
        sessions = await document_service.get_all_sessions(user_id=current_user.id)
        session = next((s for s in sessions if s["id"] == session_id), None)
        
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        result = await document_service.delete_session(session_id)
        if result:
            return {"status": "deleted", "session_id": session_id}
        else:
            raise HTTPException(status_code=500, detail="Failed to delete session")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete session: {str(e)}")


@router.patch("/api/sessions/{session_id}")
async def rename_session_endpoint(
    session_id: str,
    request: dict,
    current_user: UserResponse = Depends(get_current_user)
):
    """Rename a session (requires authentication)."""
    try:
        new_name = request.get("session_name")
        if not new_name or not new_name.strip():
            raise HTTPException(status_code=400, detail="Session name is required")
        
        sessions = await document_service.get_all_sessions(user_id=current_user.id)
        session = next((s for s in sessions if s["id"] == session_id), None)
        
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        await document_service.update_session_name(session_id, new_name.strip())
        return {"status": "success", "session_id": session_id, "new_name": new_name.strip()}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to rename session: {str(e)}")


@router.put("/api/sessions/{session_id}")
async def update_session(session_id: str, request: dict):
    """Update session name (legacy endpoint, use PATCH instead)."""
    try:
        new_name = request.get("name")
        if not new_name:
            raise HTTPException(status_code=400, detail="Session name is required")
        
        await document_service.update_session_name(session_id, new_name)
        
        return {"status": "updated", "session_id": session_id, "name": new_name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update session: {str(e)}")


@router.post("/api/sessions/{session_id}/messages")
async def add_message_to_session_endpoint(session_id: str, request: dict):
    """Add a message to a session."""
    try:
        role = request.get("role", "user")
        content = request.get("content", "")
        
        if not content:
            raise HTTPException(status_code=400, detail="Message content is required")
        
        await document_service.add_message_to_session(session_id, role, content)
        
        return {"status": "message_added", "session_id": session_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add message: {str(e)}")


# Frontend-compatible endpoints (without /api prefix)
@router.get("/sessions")
async def get_sessions_frontend():
    """Frontend endpoint to get all sessions."""
    try:
        sessions = await document_service.get_all_sessions()
        
        for session in sessions:
            if session.get("created_at"):
                try:
                    dt = datetime.fromisoformat(session["created_at"])
                    session["created_at_display"] = dt.strftime('%Y-%m-%d %H:%M')
                    session["updated_at_display"] = dt.strftime('%Y-%m-%d %H:%M') if session.get("updated_at") else dt.strftime('%Y-%m-%d %H:%M')
                except Exception as e:
                    print(f"Date parsing error: {e}")
                    session["created_at_display"] = "Invalid Date"
                    session["updated_at_display"] = "Invalid Date"
            else:
                session["created_at_display"] = "No Date"
                session["updated_at_display"] = "No Date"
        
        return {"sessions": sessions}
    except Exception as e:
        print(f"Session retrieval error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get sessions: {str(e)}")


@router.post("/sessions")
async def create_session_frontend(request: dict):
    """Frontend endpoint to create new session."""
    try:
        session_name = request.get("name", f"New Session {datetime.now().strftime('%Y-%m-%d %H:%M')}")
        session_id = await document_service.create_session(session_name)
        
        return {
            "session_id": session_id,
            "name": session_name,
            "created_at": datetime.now().isoformat(),
            "created_at_display": datetime.now().strftime('%Y-%m-%d %H:%M'),
            "status": "created"
        }
    except Exception as e:
        print(f"Session creation error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create session: {str(e)}")


@router.get("/debug/sessions")
async def debug_sessions():
    """Debug endpoint to see raw session data."""
    try:
        import aiosqlite
        
        async with aiosqlite.connect("data/sessions.db") as db:
            cursor = await db.execute("SELECT * FROM sessions ORDER BY created_at DESC")
            sessions = await cursor.fetchall()
            
            cursor = await db.execute("PRAGMA table_info(sessions)")
            columns = await cursor.fetchall()
            column_names = [col[1] for col in columns]
            
            formatted_sessions = []
            for session in sessions:
                session_dict = dict(zip(column_names, session))
                formatted_sessions.append(session_dict)
            
            return {
                "columns": column_names,
                "sessions": formatted_sessions,
                "count": len(formatted_sessions)
            }
    except Exception as e:
        return {"error": str(e)}
