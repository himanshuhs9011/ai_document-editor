"""Inline AI for the editor: "/" commands and ghost-text autocomplete."""
from fastapi import APIRouter, Depends, HTTPException

from ..deps import Services, ai_target, get_services, premium_target
from ..models.schemas import CompletionRequest, InlineAiRequest
from ..services.llm import LLMError, ModelTarget
from ..sse import sse_response

router = APIRouter(prefix="/api/ai", tags=["inline-ai"])


@router.post("/inline")
async def inline(request: InlineAiRequest, target: ModelTarget = Depends(ai_target),
                 services: Services = Depends(get_services)):
    return sse_response(services.inline.stream(request, target))


@router.post("/complete")
async def complete(request: CompletionRequest, target: ModelTarget = Depends(premium_target),
                   services: Services = Depends(get_services)):
    try:
        return {"completion": await services.inline.complete(request, target)}
    except LLMError as error:
        raise HTTPException(status_code=502, detail=str(error))
