"""Desktop app: sign-in, plan and API-key requests are passed through to the online gateway unchanged."""
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response

from ..services.gateway_client import GatewayUnavailable

router = APIRouter(tags=["account"])

METHODS = ["GET", "POST", "PATCH", "DELETE"]
OFFLINE = "Can't reach the AI Document Editor service. Check your internet connection; editing keeps working offline."


async def _forward(request: Request) -> Response:
    gateway = request.app.state.services.gateway
    try:
        answer = await gateway.forward(request.method, request.url.path, request.url.query,
                                       dict(request.headers), await request.body())
    except GatewayUnavailable:
        raise HTTPException(status_code=503, detail=OFFLINE)
    return Response(content=answer.content, status_code=answer.status_code,
                    media_type=answer.headers.get("content-type", "application/json"))


@router.api_route("/api/auth/{rest:path}", methods=METHODS, include_in_schema=False)
async def auth(request: Request):
    return await _forward(request)


@router.api_route("/api/billing", methods=["GET"], include_in_schema=False)
async def billing(request: Request):
    return await _forward(request)


@router.api_route("/api/keys", methods=METHODS, include_in_schema=False)
@router.api_route("/api/keys/{rest:path}", methods=METHODS, include_in_schema=False)
async def keys(request: Request):
    return await _forward(request)
