"""The AI gateway for desktop apps: an OpenAI-style chat endpoint that checks and counts every call.

Desktop apps keep documents on the PC and send only the text a model call needs. Each call here is one AI request
against the user's daily allowance (free when their own API key pays). The model, the key and the provider are
decided here, never by the caller; only the conversation and a few sampling settings are passed on.
"""
from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse

from ..config import settings
from ..deps import Services, gateway_call_target, get_services
from ..services.llm import LLMError, ModelTarget

router = APIRouter(prefix="/gateway/v1", tags=["gateway"])

ROLES = {"system", "user", "assistant"}
MAX_MESSAGES = 200
# Deep read sends whole document pieces (up to 60,000 characters each) plus the conversation so far.
MAX_PROMPT_CHARS = 800_000


def _messages(body: Any) -> List[dict]:
    messages = body.get("messages") if isinstance(body, dict) else None
    if not isinstance(messages, list) or not 0 < len(messages) <= MAX_MESSAGES:
        raise HTTPException(status_code=422, detail=f"messages must be a list of 1 to {MAX_MESSAGES} items")
    cleaned, total = [], 0
    for message in messages:
        if not isinstance(message, dict) or message.get("role") not in ROLES or not isinstance(message.get("content"), str):
            raise HTTPException(status_code=422, detail="each message needs a role (system, user or assistant) and text content")
        total += len(message["content"])
        cleaned.append({"role": message["role"], "content": message["content"]})
    if total > MAX_PROMPT_CHARS:
        raise HTTPException(status_code=413, detail=f"The request is longer than {MAX_PROMPT_CHARS:,} characters.")
    return cleaned


def _payload(body: dict, target: ModelTarget) -> dict:
    payload = {"model": target.model, "messages": _messages(body)}
    temperature = body.get("temperature")
    if isinstance(temperature, (int, float)) and 0 <= temperature <= 2:
        payload["temperature"] = temperature
    requested = body.get("max_tokens")
    limit = settings.num_predict
    payload["max_tokens"] = min(requested, limit) if isinstance(requested, int) and requested > 0 else limit
    return payload


@router.post("/chat/completions")
async def chat_completions(request: Request, target: ModelTarget = Depends(gateway_call_target),
                           services: Services = Depends(get_services)):
    try:
        body = await request.json()
    except ValueError:
        raise HTTPException(status_code=400, detail="The request body must be JSON.")
    payload = _payload(body, target)
    if body.get("stream") is True:
        return StreamingResponse(services.llm.relay_stream(target, payload), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
    try:
        return JSONResponse(await services.llm.relay(target, payload))
    except LLMError as error:
        raise HTTPException(status_code=502, detail=str(error))
