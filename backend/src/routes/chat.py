"""AI chat endpoints (count against the paywall)."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException

from ..db import sessions
from ..deps import Services, ai_target, get_current_user, get_services
from ..models.schemas import ChatRequest
from ..models.user import UserResponse
from ..services import billing
from ..services.llm import ModelTarget
from ..sse import sse_response

router = APIRouter(tags=["chat"])


async def _session_for(session_id: str | None, user: UserResponse) -> dict:
    if not session_id:
        return await sessions.create(f"Chat {datetime.now().strftime('%Y-%m-%d %H:%M')}", user.id)
    session = await sessions.get_owned(session_id, user.id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


def _charger(user: UserResponse, target: ModelTarget):
    """Deep reads make many model calls; each one after the first counts like a separate request."""
    async def charge() -> bool:
        return await billing.charge_extra(user, target)
    return charge


@router.post("/api/chat")
async def chat(request: ChatRequest, user: UserResponse = Depends(get_current_user),
               target: ModelTarget = Depends(ai_target), services: Services = Depends(get_services)):
    session = await _session_for(request.session_id, user)
    return await services.chat.handle(request, session["id"], user.id, target, _charger(user, target))


@router.post("/api/chat/stream")
async def chat_stream(request: ChatRequest, user: UserResponse = Depends(get_current_user),
                      target: ModelTarget = Depends(ai_target), services: Services = Depends(get_services)):
    session = await _session_for(request.session_id, user)
    return sse_response(services.chat.stream(request, session["id"], user.id, target, _charger(user, target)))
