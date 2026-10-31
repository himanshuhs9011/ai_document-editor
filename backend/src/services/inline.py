"""Inline AI from the editor: "/" commands (streamed) and ghost-text autocomplete."""
import logging
import re
from typing import AsyncIterator

from ..agents import prompts
from ..models.schemas import CompletionRequest, InlineAiRequest
from ..text.guardrails import guard_output
from ..text.markdown import strip_code_fence, strip_preamble, truncate
from .llm import LLMService, ModelTarget

logger = logging.getLogger(__name__)

TEXT_CHARS = 12_000
CONTEXT_CHARS = 4_000
COMPLETION_BEFORE_CHARS = 1_500
COMPLETION_AFTER_CHARS = 300
COMPLETION_TOKENS = 48


def clean_inline(raw: str) -> str:
    return guard_output(strip_code_fence(strip_preamble(raw.strip())))


def clean_completion(raw: str) -> str:
    """Keep a single line, without quotes, for ghost text."""
    first_line = next((line for line in raw.strip().splitlines() if line.strip()), "")
    return re.sub(r"\s+", " ", first_line.strip().strip('"“”')).rstrip()[:200]


class InlineService:
    def __init__(self, llm: LLMService):
        self.llm = llm

    async def stream(self, request: InlineAiRequest, target: ModelTarget) -> AsyncIterator[dict]:
        prompt = prompts.inline_action(request.action, truncate(request.text, TEXT_CHARS),
                                       truncate(request.context, CONTEXT_CHARS), request.argument)
        parts = []
        try:
            async for text in self.llm.stream(prompt, temperature=0.5, target=target):
                parts.append(text)
                yield {"event": "delta", "data": {"text": text}}
            yield {"event": "done", "data": {"text": clean_inline("".join(parts))}}
        except Exception as error:
            logger.warning("Inline AI failed: %s", error)
            yield {"event": "error", "data": {"message": str(error)}}

    async def complete(self, request: CompletionRequest, target: ModelTarget) -> str:
        prompt = prompts.autocomplete(request.before[-COMPLETION_BEFORE_CHARS:], request.after[:COMPLETION_AFTER_CHARS])
        result = await self.llm.generate_response(prompt, temperature=0.4, max_tokens=COMPLETION_TOKENS, target=target)
        return clean_completion(result.content)
