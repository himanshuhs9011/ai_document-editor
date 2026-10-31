"""Model providers users can bring their own key for; all speak the OpenAI-compatible API."""
import asyncio
import ipaddress
import socket
from typing import Optional
from urllib.parse import urlparse

PROVIDERS = {
    "openai": {"label": "OpenAI", "base_url": "https://api.openai.com/v1", "example_model": "gpt-4o-mini"},
    "anthropic": {"label": "Anthropic (Claude)", "base_url": "https://api.anthropic.com/v1", "example_model": "claude-sonnet-4-5"},
    "gemini": {"label": "Google Gemini", "base_url": "https://generativelanguage.googleapis.com/v1beta/openai", "example_model": "gemini-2.5-flash"},
    "groq": {"label": "Groq", "base_url": "https://api.groq.com/openai/v1", "example_model": "llama-3.3-70b-versatile"},
    "mistral": {"label": "Mistral", "base_url": "https://api.mistral.ai/v1", "example_model": "mistral-small-latest"},
    "deepseek": {"label": "DeepSeek", "base_url": "https://api.deepseek.com/v1", "example_model": "deepseek-chat"},
    "openrouter": {"label": "OpenRouter (any model)", "base_url": "https://openrouter.ai/api/v1", "example_model": "openai/gpt-4o-mini"},
    "xai": {"label": "xAI (Grok)", "base_url": "https://api.x.ai/v1", "example_model": "grok-3-mini"},
    "together": {"label": "Together AI", "base_url": "https://api.together.xyz/v1", "example_model": "meta-llama/Llama-3.3-70B-Instruct-Turbo"},
    "custom": {"label": "Other OpenAI-compatible API", "base_url": None, "example_model": ""},
}


class InvalidProviderUrl(ValueError):
    pass


async def ensure_public_https(url: str) -> str:
    """Reject custom endpoints that are not HTTPS or that resolve to private/internal addresses."""
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname:
        raise InvalidProviderUrl("Custom API URL must start with https://")
    try:
        infos = await asyncio.to_thread(socket.getaddrinfo, parsed.hostname, parsed.port or 443)
    except socket.gaierror:
        raise InvalidProviderUrl("Custom API host could not be resolved")
    for info in infos:
        address = ipaddress.ip_address(info[4][0])
        if not address.is_global:
            raise InvalidProviderUrl("Custom API URL must point to a public internet address")
    return url.rstrip("/")


async def resolve_base_url(provider: str, custom_url: Optional[str]) -> str:
    if provider not in PROVIDERS:
        raise InvalidProviderUrl(f"Unknown provider: {provider}")
    if provider == "custom":
        return await ensure_public_https(custom_url or "")
    return PROVIDERS[provider]["base_url"]
