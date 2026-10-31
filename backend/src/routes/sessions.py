"""Chat session CRUD and message history (each user sees only their own)."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from ..db import messages, sessions
from ..deps import get_current_user, owned_session
from ..models.schemas import SessionCreateRequest, SessionRenameRequest
from ..models.user import UserResponse

router = APIRouter(tags=["sessions"])


def _display(timestamp: Optional[str]) -> str:
    try:
        return datetime.fromisoformat(timestamp).strftime("%Y-%m-%d %H:%M")
    except (TypeError, ValueError):
        return "Unknown"


@router.post("/api/sessions")
async def create_session(request: SessionCreateRequest, user: UserResponse = Depends(get_current_user)):
    name = request.session_name or request.name or f"New Session {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    session = await sessions.create(name, user.id)
    return {"session_id": session["id"], "name": name, "created_at": session["created_at"],
            "status": "created", "user_id": user.id}


@router.get("/api/sessions")
async def list_sessions(user: UserResponse = Depends(get_current_user)):
    items = await sessions.list_for_user(user.id)
    for session in items:
        session["created_at_display"] = _display(session["created_at"])
        session["updated_at_display"] = _display(session["updated_at"])
    return {"sessions": items}


@router.patch("/api/sessions/{session_id}")
async def rename_session(request: SessionRenameRequest, session: dict = Depends(owned_session)):
    name = (request.session_name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Session name is required")
    await sessions.rename(session["id"], name)
    return {"status": "success", "session_id": session["id"], "new_name": name}


@router.delete("/api/sessions/{session_id}")
async def delete_session(session: dict = Depends(owned_session)):
    await sessions.delete(session["id"])
    return {"status": "deleted", "session_id": session["id"]}


@router.get("/api/session/{session_id}/history")
async def session_history(session: dict = Depends(owned_session)):
    return {"messages": await messages.list_for_session(session["id"])}
