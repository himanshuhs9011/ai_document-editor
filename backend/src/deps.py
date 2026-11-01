"""Shared service container and FastAPI dependencies.

The same dependencies serve all three modes (see APP_MODE in config): on the server and the gateway the user and
their allowance come from Postgres; in the desktop app ("local") they come from the online gateway, and every AI
call goes through that gateway, which counts it.
"""
from dataclasses import dataclass
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from . import cache
from .agents.harness.engine import Harness
from .config import settings
from .db import sessions
from .models.user import UserResponse
from .services import auth, billing, keys
from .services.chat import ChatService
from .services.gateway_client import GatewayClient, GatewayUnavailable
from .services.inline import InlineService
from .services.llm import GATEWAY, LLMService, ModelTarget
from .services.retrieval import Retriever

bearer = HTTPBearer(auto_error=False)

AI_REQUESTS_PER_MINUTE = 30
COMPLETIONS_PER_MINUTE = 40
# Studio and deep read make many model calls for one question; each is a separate gateway request.
GATEWAY_REQUESTS_PER_MINUTE = 120
OFFLINE = "You're offline. AI features need an internet connection; editing keeps working."
NOT_SIGNED_IN = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials",
                              headers={"WWW-Authenticate": "Bearer"})


@dataclass
class Services:
    llm: LLMService
    retriever: Retriever
    chat: ChatService
    inline: InlineService
    harness: Harness
    gateway: Optional[GatewayClient] = None


def build_services() -> Services:
    gateway = None
    if settings.app_mode == "local":
        # The desktop app has no model of its own: every call goes to the gateway with the user's sign-in token.
        default = ModelTarget(GATEWAY, "server", f"{settings.gateway_url}/gateway/v1")
        embedding = None
        gateway = GatewayClient(settings.gateway_url)
    elif settings.app_mode == "standalone":
        # No server model and no embeddings: AI runs on each user's own key, search is keyword ranking.
        default = ModelTarget("none", "none", "http://127.0.0.1:9")
        embedding = None
    else:
        default = ModelTarget(settings.llm_provider, settings.llm_model, settings.llm_base_url, settings.llm_api_key)
        embedding = ModelTarget(settings.embedding_provider, settings.embedding_model,
                                settings.embedding_base_url, settings.embedding_api_key)
    llm = LLMService(default, embedding, settings.llm_timeout, settings.num_predict)
    retriever = Retriever(llm)
    return Services(llm=llm, retriever=retriever, chat=ChatService(llm, retriever), inline=InlineService(llm),
                    harness=Harness(llm, retriever), gateway=gateway)


def get_services(request: Request) -> Services:
    return request.app.state.services


def _token(credentials: Optional[HTTPAuthorizationCredentials]) -> str:
    if not credentials:
        raise NOT_SIGNED_IN
    return credentials.credentials


async def get_current_user(request: Request,
                           credentials: HTTPAuthorizationCredentials = Depends(bearer)) -> UserResponse:
    if settings.app_mode == "local":
        token = _token(credentials)
        gateway = request.app.state.services.gateway
        try:
            user = await gateway.me(token)
        except GatewayUnavailable:
            user = gateway.offline_user(token)
        if user is None:
            raise NOT_SIGNED_IN
        return user
    user_id = auth.decode_token(credentials.credentials) if credentials else None
    user = await auth.get_user(user_id) if user_id else None
    if user is None or not user.is_active:
        raise NOT_SIGNED_IN
    return user


def client_ip(request: Request) -> str:
    """The caller's address. Behind N trusted proxies (Cloud Run: 1), the Nth X-Forwarded-For entry from the right;
    entries further left are supplied by the client and could be forged."""
    hops = settings.trusted_proxy_hops
    forwarded = [part.strip() for part in request.headers.get("x-forwarded-for", "").split(",") if part.strip()]
    if hops and len(forwarded) >= hops:
        return forwarded[-hops]
    return request.client.host if request.client else "unknown"


async def owned_session(session_id: str, user: UserResponse = Depends(get_current_user)) -> dict:
    session = await sessions.get_owned(session_id, user.id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


async def _gateway_target(token: str, services: Services, premium: bool) -> ModelTarget:
    """Desktop app: check the allowance online first (so the paywall shows before any work starts), then send every
    model call to the gateway, which checks and counts it again."""
    try:
        plan = await services.gateway.billing(token)
    except GatewayUnavailable:
        raise HTTPException(status_code=503, detail=OFFLINE)
    own_key = plan.get("using_own_key")
    if premium and not own_key and plan.get("plan") != "pro":
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail={
            "code": "upgrade_required",
            "message": "Autocomplete needs your own API key (add one in AI & Plan) or the Pro plan.",
        })
    if not own_key and not plan.get("server_ai_ready", True):
        raise HTTPException(status_code=503, detail="The AI service is not available right now.")
    if not own_key and plan.get("ai_used_today", 0) >= plan.get("ai_daily_limit", 0):
        limit = plan.get("ai_daily_limit", 0)
        hint = "" if plan.get("plan") == "pro" else " or upgrade to Pro"
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail={
            "code": "upgrade_required",
            "message": f"You've used all {limit} AI requests for today. Add your own API key in Settings{hint}.",
        })
    return ModelTarget(GATEWAY, "server", f"{settings.gateway_url}/gateway/v1", token)


async def _own_key_target(user: UserResponse) -> ModelTarget:
    """Standalone desktop app: AI runs on the user's own key; without one, AI & Plan opens to add it."""
    own = await keys.active_target(user.id)
    if own:
        return own
    raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail={
        "code": "key_required",
        "message": "AI runs on your own API key. Add one below (Google Gemini has a free tier), then try again.",
    })


async def ai_target(user: UserResponse = Depends(get_current_user), services: Services = Depends(get_services),
                    credentials: HTTPAuthorizationCredentials = Depends(bearer)) -> ModelTarget:
    """The model this AI request runs on; enforces the rate limit and the paywall."""
    if not await cache.allow(f"ai:{user.id}", AI_REQUESTS_PER_MINUTE, 60):
        raise HTTPException(status_code=429, detail="Too many AI requests. Please wait a minute.")
    if settings.app_mode == "local":
        return await _gateway_target(_token(credentials), services, premium=False)
    if settings.app_mode == "standalone":
        return await _own_key_target(user)
    return await billing.ai_target(user, services.llm)


async def premium_target(user: UserResponse = Depends(get_current_user), services: Services = Depends(get_services),
                         credentials: HTTPAuthorizationCredentials = Depends(bearer)) -> ModelTarget:
    """Model for autocomplete: the user's own key or Pro only, with its own rate limit."""
    if not await cache.allow(f"complete:{user.id}", COMPLETIONS_PER_MINUTE, 60):
        raise HTTPException(status_code=429, detail="Too many autocomplete requests.")
    if settings.app_mode == "local":
        return await _gateway_target(_token(credentials), services, premium=True)
    if settings.app_mode == "standalone":
        return await _own_key_target(user)
    return await billing.premium_target(user, services.llm)


async def gateway_call_target(user: UserResponse = Depends(get_current_user),
                              services: Services = Depends(get_services)) -> ModelTarget:
    """Gateway: one model call from a desktop app, counted against the user's allowance (unless their own key pays)."""
    if not await cache.allow(f"gateway:{user.id}", GATEWAY_REQUESTS_PER_MINUTE, 60):
        raise HTTPException(status_code=429, detail="Too many AI requests. Please wait a minute.")
    return await billing.ai_target(user, services.llm)
