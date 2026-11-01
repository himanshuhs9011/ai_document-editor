"""Chat and embedding calls to any OpenAI-compatible API (Ollama locally, hosted providers online)."""
import json
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import AsyncIterator, List, Optional

import httpx

from ..models.schemas import HealthStatus, LLMResponse
from .providers import ensure_public_https

logger = logging.getLogger(__name__)

DEFAULT_SYSTEM_PROMPT = (
    "You are an AI assistant specialized in document editing and analysis. "
    "You help users edit, improve, and analyze documents while maintaining their original intent and style. "
    "Provide clear, actionable suggestions and maintain professional tone."
)
EMBED_BATCH = 64


@dataclass(frozen=True)
class ModelTarget:
    """Which model answers a request: the server's own, or one the user brought a key for."""
    provider: str
    model: str
    base_url: str
    api_key: Optional[str] = None
    is_user_key: bool = False


GATEWAY = "gateway"


class LLMError(RuntimeError):
    def __init__(self, message: str, status: Optional[int] = None):
        super().__init__(message)
        self.status = status


def _detail(body: str) -> Optional[str]:
    """The user-facing message in one of our own API error bodies ({"detail": "..."} or {"detail": {"message": ...}})."""
    try:
        detail = json.loads(body).get("detail")
    except (ValueError, AttributeError):
        return None
    if isinstance(detail, dict):
        detail = detail.get("message")
    return detail if isinstance(detail, str) else None


class LLMService:
    def __init__(self, default: ModelTarget, embedding: ModelTarget, timeout: int, max_tokens: int):
        self.default = default
        self.embedding = embedding
        self.max_tokens = max_tokens
        self.timeout = timeout
        self.client = httpx.AsyncClient(timeout=httpx.Timeout(30.0, read=timeout))
        self.is_initialized = False

    def available(self, target: ModelTarget) -> bool:
        return target.is_user_key or self.is_initialized

    async def initialize(self) -> None:
        """Check the server model is reachable; locally, pull a missing Ollama model."""
        try:
            response = await self.client.get(f"{self.default.base_url}/models", headers=self._headers(self.default))
            response.raise_for_status()
            if self.default.provider == "ollama":
                await self._pull_if_missing(response.json())
            self.is_initialized = True
            logger.info("Server model ready: %s/%s", self.default.provider, self.default.model)
        except Exception as error:
            logger.error("Server model unavailable at %s: %s", self.default.base_url, error)

    async def _pull_if_missing(self, models: dict) -> None:
        names = {model["id"] for model in models.get("data", [])}
        if self.default.model not in names:
            native = self.default.base_url.removesuffix("/v1")
            logger.info("Pulling missing Ollama model %s", self.default.model)
            pull = await self.client.post(f"{native}/api/pull", json={"name": self.default.model}, timeout=3600)
            pull.raise_for_status()

    @staticmethod
    def _headers(target: ModelTarget) -> dict:
        return {"Authorization": f"Bearer {target.api_key}"} if target.api_key else {}

    def _status_error(self, target: ModelTarget, status_code: int, body: str) -> LLMError:
        if target.provider == GATEWAY:
            # Our own gateway's messages (allowance used up, signed out) are written for the user.
            return LLMError(_detail(body) or f"The AI service returned an error ({status_code}).", status_code)
        if status_code in (401, 403):
            return LLMError(f"{target.provider} rejected the API key.")
        if not target.is_user_key:
            # The server's provider errors can name its account or key; users only see that it failed.
            logger.error("Server model returned %s: %s", status_code, body[:500])
            return LLMError(f"The AI service returned an error ({status_code}).")
        return LLMError(f"{target.provider} returned {status_code}: {body[:300]}")

    def _transport_error(self, target: ModelTarget, error: httpx.HTTPError) -> LLMError:
        if isinstance(error, httpx.ReadTimeout):
            return LLMError(f"The model took longer than {self.timeout} seconds to answer.")
        return LLMError(f"Could not reach {target.provider}: {error}")

    async def _post(self, target: ModelTarget, path: str, payload: dict) -> dict:
        if target.provider == "custom":
            await ensure_public_https(target.base_url)
        try:
            response = await self.client.post(f"{target.base_url}{path}", json=payload, headers=self._headers(target))
        except httpx.HTTPError as error:
            raise self._transport_error(target, error)
        if response.status_code != 200:
            raise self._status_error(target, response.status_code, response.text)
        return response.json()

    def _chat_payload(self, target: ModelTarget, messages: List[dict], temperature: float,
                      max_tokens: Optional[int], minimal: bool = False) -> dict:
        payload = {"model": target.model, "messages": messages}
        if not minimal:
            payload.update(temperature=temperature, max_tokens=max_tokens or self.max_tokens)
        return payload

    @staticmethod
    def _messages(prompt: str, system_prompt: Optional[str]) -> List[dict]:
        return [{"role": "system", "content": system_prompt or DEFAULT_SYSTEM_PROMPT}, {"role": "user", "content": prompt}]

    @staticmethod
    def _rejects_sampling(error: LLMError) -> bool:
        """Some reasoning models refuse custom temperature/max_tokens; those calls are retried with defaults."""
        return "temperature" in str(error) or "max_tokens" in str(error)

    def _check_available(self, target: ModelTarget) -> None:
        if not self.available(target):
            raise LLMError("The AI service is not available right now.")

    async def generate_response(self, prompt: str, system_prompt: Optional[str] = None, temperature: float = 0.7,
                                max_tokens: Optional[int] = None, target: Optional[ModelTarget] = None) -> LLMResponse:
        return await self.converse(self._messages(prompt, system_prompt), temperature, max_tokens, target)

    async def converse(self, messages: List[dict], temperature: float = 0.7, max_tokens: Optional[int] = None,
                       target: Optional[ModelTarget] = None) -> LLMResponse:
        """One reply to a whole conversation (system, user and assistant turns)."""
        target = target or self.default
        self._check_available(target)
        started = datetime.now()
        try:
            result = await self._post(target, "/chat/completions", self._chat_payload(target, messages, temperature, max_tokens))
        except LLMError as error:
            if not self._rejects_sampling(error):
                raise
            result = await self._post(target, "/chat/completions",
                                      self._chat_payload(target, messages, temperature, max_tokens, minimal=True))
        return LLMResponse(
            content=result["choices"][0]["message"].get("content") or "",
            model=target.model,
            tokens_used=(result.get("usage") or {}).get("completion_tokens", 0),
            processing_time=(datetime.now() - started).total_seconds(),
        )

    async def _stream_once(self, target: ModelTarget, payload: dict) -> AsyncIterator[str]:
        if target.provider == "custom":
            await ensure_public_https(target.base_url)
        try:
            async with self.client.stream("POST", f"{target.base_url}/chat/completions",
                                          json={**payload, "stream": True}, headers=self._headers(target)) as response:
                if response.status_code != 200:
                    raise self._status_error(target, response.status_code, (await response.aread()).decode(errors="replace"))
                async for line in response.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        return
                    chunk = json.loads(data)
                    if chunk.get("error"):
                        # Providers (and our gateway) report a failure part-way through as an error chunk.
                        error = chunk["error"]
                        raise LLMError(error.get("message", "The AI service failed.") if isinstance(error, dict) else str(error))
                    choices = chunk.get("choices") or []
                    text = (choices[0].get("delta") or {}).get("content") if choices else None
                    if text:
                        yield text
        except httpx.HTTPError as error:
            raise self._transport_error(target, error)

    async def stream(self, prompt: str, system_prompt: Optional[str] = None, temperature: float = 0.7,
                     max_tokens: Optional[int] = None, target: Optional[ModelTarget] = None) -> AsyncIterator[str]:
        """Yield the answer piece by piece as the model writes it."""
        target = target or self.default
        self._check_available(target)
        started = False
        try:
            async for text in self._stream_once(target, self._chat_payload(target, self._messages(prompt, system_prompt), temperature, max_tokens)):
                started = True
                yield text
        except LLMError as error:
            if started or not self._rejects_sampling(error):
                raise
            async for text in self._stream_once(target, self._chat_payload(target, self._messages(prompt, system_prompt), temperature, max_tokens, minimal=True)):
                yield text

    async def relay(self, target: ModelTarget, payload: dict) -> dict:
        """The gateway's pass-through: one chat completion on the target, returned as the provider sent it."""
        try:
            return await self._post(target, "/chat/completions", payload)
        except LLMError as error:
            if not self._rejects_sampling(error):
                raise
            return await self._post(target, "/chat/completions",
                                    {key: value for key, value in payload.items() if key not in ("temperature", "max_tokens")})

    async def relay_stream(self, target: ModelTarget, payload: dict) -> AsyncIterator[str]:
        """The gateway's streaming pass-through, re-sent as OpenAI-style server-sent events (errors as error chunks)."""
        def event(body: dict) -> str:
            return f"data: {json.dumps(body)}\n\n"

        started = False
        try:
            try:
                async for text in self._stream_once(target, payload):
                    started = True
                    yield event({"choices": [{"delta": {"content": text}}]})
            except LLMError as error:
                if started or not self._rejects_sampling(error):
                    raise
                minimal = {key: value for key, value in payload.items() if key not in ("temperature", "max_tokens")}
                async for text in self._stream_once(target, minimal):
                    yield event({"choices": [{"delta": {"content": text}}]})
        except LLMError as error:
            yield event({"error": {"message": str(error)}})
        yield "data: [DONE]\n\n"

    async def embed(self, texts: List[str]) -> List[List[float]]:
        vectors: List[List[float]] = []
        for start in range(0, len(texts), EMBED_BATCH):
            batch = texts[start:start + EMBED_BATCH]
            result = await self._post(self.embedding, "/embeddings", {"model": self.embedding.model, "input": batch})
            vectors += [item["embedding"] for item in sorted(result["data"], key=lambda item: item["index"])]
        return vectors

    async def test_key(self, target: ModelTarget) -> None:
        """Make one tiny request so a pasted key is checked before it is saved."""
        await self.generate_response("Reply with OK.", temperature=0, max_tokens=5, target=target)

    async def health_check(self) -> HealthStatus:
        try:
            response = await self.client.get(f"{self.default.base_url}/models", headers=self._headers(self.default))
            response.raise_for_status()
            return HealthStatus(service="llm", status="healthy",
                                details={"provider": self.default.provider, "model": self.default.model})
        except Exception as error:
            return HealthStatus(service="llm", status="unhealthy", details={"error": str(error)})

    async def close(self) -> None:
        await self.client.aclose()
