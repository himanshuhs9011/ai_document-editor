"""Shared service container and FastAPI dependencies."""
from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from . import cache
from .agents.harness.engine import Harness
from .config import settings
from .db import sessions
from .models.user import UserResponse
from .services import auth, billing
from .services.chat import ChatService
from .services.inline import InlineService
from .services.llm import LLMService, ModelTarget
from .services.retrieval import Retriever

bearer = HTTPBearer(auto_error=False)

AI_REQUESTS_PER_MINUTE = 30
COMPLETIONS_PER_MINUTE = 40


@dataclass
class Services:
    llm: LLMService
    retriever: Retriever
    chat: ChatService
    inline: InlineService
    harness: Harness


def build_services() -> Services:
    default = ModelTarget(settings.llm_provider, settings.llm_model, settings.llm_base_url, settings.llm_api_key)
    embedding = ModelTarget(settings.embedding_provider, settings.embedding_model,
                            settings.embedding_base_url, settings.embedding_api_key)
    llm = LLMService(default, embedding, settings.llm_timeout, settings.num_predict)
    retriever = Retriever(llm)
    return Services(llm=llm, retriever=retriever, chat=ChatService(llm, retriever), inline=InlineService(llm),
                    harness=Harness(llm, retriever))


def get_services(request: Request) -> Services:
    return request.app.state.services


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer)) -> UserResponse:
    user_id = auth.decode_token(credentials.credentials) if credentials else None
    user = await auth.get_user(user_id) if user_id else None
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
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


async def ai_target(user: UserResponse = Depends(get_current_user),
                    services: Services = Depends(get_services)) -> ModelTarget:
    """The model this AI request runs on; enforces the rate limit and the paywall."""
    if not await cache.allow(f"ai:{user.id}", AI_REQUESTS_PER_MINUTE, 60):
        raise HTTPException(status_code=429, detail="Too many AI requests. Please wait a minute.")
    return await billing.ai_target(user, services.llm)


async def premium_target(user: UserResponse = Depends(get_current_user),
                         services: Services = Depends(get_services)) -> ModelTarget:
    """Model for autocomplete: the user's own key or Pro only, with its own rate limit."""
    if not await cache.allow(f"complete:{user.id}", COMPLETIONS_PER_MINUTE, 60):
        raise HTTPException(status_code=429, detail="Too many autocomplete requests.")
    return await billing.premium_target(user, services.llm)
