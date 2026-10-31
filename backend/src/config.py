"""Application settings read from environment variables, with local defaults from model-config.json."""
import base64
import hashlib
import json
import logging
import os
import secrets
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Tuple

from dotenv import load_dotenv

logger = logging.getLogger(__name__)

BACKEND_DIR = Path(__file__).resolve().parent.parent
MODEL_CONFIG_PATH = BACKEND_DIR.parent / "model-config.json"
PLACEHOLDER_SECRET = "CHANGE_ME_GENERATE_NEW_SECRET_KEY"

load_dotenv(BACKEND_DIR / ".env")


@dataclass(frozen=True)
class Settings:
    database_url: str
    redis_url: Optional[str]
    secret_key: str
    encryption_key: bytes
    llm_provider: str
    llm_model: str
    llm_base_url: str
    llm_api_key: Optional[str]
    embedding_provider: str
    embedding_model: str
    embedding_base_url: str
    embedding_api_key: Optional[str]
    llm_timeout: int
    num_predict: int
    free_ai_daily: int
    pro_ai_daily: int
    max_upload_mb: int
    cors_origins: Tuple[str, ...]
    trusted_proxy_hops: int
    host: str
    port: int


def _env(name: str, default: Optional[str] = None) -> Optional[str]:
    value = os.getenv(name, "").strip()
    return value or default


def _read_model_config() -> dict:
    if not MODEL_CONFIG_PATH.exists():
        return {}
    return json.loads(MODEL_CONFIG_PATH.read_text(encoding="utf-8"))


def _secret_key() -> str:
    key = _env("SECRET_KEY")
    if key and key != PLACEHOLDER_SECRET:
        return key
    # A random key keeps tokens unforgeable; they just stop working after a restart.
    logger.warning("SECRET_KEY is not set; using a random key for this run")
    return secrets.token_urlsafe(32)


def _encryption_key(secret_key: str) -> bytes:
    """Fernet key for stored API keys: ENCRYPTION_KEY, or one derived from SECRET_KEY."""
    explicit = _env("ENCRYPTION_KEY")
    if explicit:
        return explicit.encode()
    return base64.urlsafe_b64encode(hashlib.sha256(f"api-keys:{secret_key}".encode()).digest())


def load_settings() -> Settings:
    model_config = _read_model_config()
    ollama_url = model_config.get("model_settings", {}).get("base_url", "http://localhost:11434")
    secret_key = _secret_key()
    return Settings(
        database_url=_env("DATABASE_URL", "postgresql://docai:docai@localhost:5432/docai"),
        redis_url=_env("REDIS_URL"),
        secret_key=secret_key,
        encryption_key=_encryption_key(secret_key),
        llm_provider=_env("LLM_PROVIDER", "ollama"),
        llm_model=_env("LLM_MODEL", model_config.get("model_name", "gemma3:latest")),
        llm_base_url=_env("LLM_BASE_URL", f"{ollama_url}/v1"),
        llm_api_key=_env("LLM_API_KEY"),
        embedding_provider=_env("EMBEDDING_PROVIDER", "ollama"),
        embedding_model=_env("EMBEDDING_MODEL", model_config.get("embedding_model", "nomic-embed-text:latest")),
        embedding_base_url=_env("EMBEDDING_BASE_URL", f"{ollama_url}/v1"),
        embedding_api_key=_env("EMBEDDING_API_KEY"),
        llm_timeout=int(_env("LLM_TIMEOUT", str(model_config.get("model_settings", {}).get("timeout", 120)))),
        num_predict=int(_env("LLM_MAX_TOKENS", str(model_config.get("model_settings", {}).get("num_predict", 4096)))),
        free_ai_daily=int(_env("FREE_AI_DAILY_LIMIT", "10")),
        pro_ai_daily=int(_env("PRO_AI_DAILY_LIMIT", "500")),
        max_upload_mb=int(_env("MAX_UPLOAD_MB", "20")),
        cors_origins=tuple(_env("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")),
        trusted_proxy_hops=int(_env("TRUSTED_PROXY_HOPS", "0")),
        host=_env("HOST", "127.0.0.1"),
        port=int(_env("PORT", "8000")),
    )


settings = load_settings()
