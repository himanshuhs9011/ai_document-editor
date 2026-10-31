"""Bring-your-own-key: validate, encrypt and load users' provider API keys."""
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

from ..config import settings
from ..db import api_keys
from .llm import LLMService, ModelTarget
from .providers import resolve_base_url

_fernet = Fernet(settings.encryption_key)


def _hint(api_key: str) -> str:
    return f"…{api_key[-4:]}" if len(api_key) > 8 else "…"


async def save_key(llm: LLMService, user_id: str, provider: str, api_key: str, model: str,
                   base_url: Optional[str]) -> dict:
    """Check the key works with one tiny request, then store it encrypted and make it active."""
    resolved = await resolve_base_url(provider, base_url)
    target = ModelTarget(provider, model, resolved, api_key, is_user_key=True)
    await llm.test_key(target)
    stored_url = resolved if provider == "custom" else None
    encrypted = _fernet.encrypt(api_key.encode()).decode()
    return await api_keys.upsert_active(user_id, provider, model, stored_url, encrypted, _hint(api_key))


async def active_target(user_id: str) -> Optional[ModelTarget]:
    row = await api_keys.get_active(user_id)
    if not row:
        return None
    try:
        api_key = _fernet.decrypt(row["encrypted_key"].encode()).decode()
    except InvalidToken:
        return None
    base_url = await resolve_base_url(row["provider"], row["base_url"])
    return ModelTarget(row["provider"], row["model"], base_url, api_key, is_user_key=True)
