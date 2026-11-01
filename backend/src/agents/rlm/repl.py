"""The REPL of a recursive language model (RLM): where the long text lives and the model's code runs.

This is the textbook RLMRepl (a `context` variable, FINAL, llm_query, execute) with one change that matters on a
server: model-written code runs in our own Sandbox (sandbox.py), never in exec(). With exec() the code gets the whole
of Python (import os, open(), __import__), and a document can contain instructions that talk the model into writing
exactly that. The Sandbox also caps time, memory and output, which exec() cannot.
"""
import asyncio
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, List, Optional, Tuple, cast

from ...services.llm import LLMError, LLMService, ModelTarget
from ...services.retrieval import split_text
from . import prompts
from .sandbox import Sandbox, SandboxError, _safe_str

LIMIT_REACHED = "Stopped early: the daily AI limit was reached."
MAX_ANSWER_CHARS = 20_000
GREP_RESULTS = 200
GREP_LINE_CHARS = 300


@dataclass(frozen=True)
class Limits:
    max_turns: int = 8           # root-model steps: iterations of the loop
    max_sub_calls: int = 24      # helper-model calls (llm_query) per question
    sub_chars: int = 60_000      # longest prompt one helper call receives
    output_chars: int = 4_000    # printed output the root model sees per step
    direct_chars: int = 24_000   # texts this short are read in one call, without the loop
    preview_chars: int = 1_500   # how much of the opening the first message shows
    parallel: int = 4            # helper calls running at once in llm_query_batch
    step_timeout: float = 300.0  # seconds one code block may take, helper calls included


def _shown(output: str, error: Optional[str], limit: int) -> str:
    """What the root model sees of a step: the printed output, cut to the limit, then any error."""
    text = output if len(output) <= limit else output[:limit] + f"\n[... {len(output) - limit:,} more characters not shown]"
    if error:
        text = f"{text}\nError: {error}" if text.strip() else f"Error: {error}"
    return text.strip() or "(no output; use print to see values)"


class RLMRepl:
    """A notebook for the root model: `context` holds the text, variables persist between steps, and print() is the
    only way the model sees anything."""

    def __init__(self, context: str, documents: List[Tuple[str, str]], llm: LLMService, target: Optional[ModelTarget],
                 charge: Callable[[], Awaitable[bool]], limits: Limits = Limits()):
        self.context = context
        self.llm = llm
        self.target = target
        self.charge = charge
        self.limits = limits
        self.final_answer: Optional[str] = None  # set when the code calls FINAL(answer)
        self.sub_call_count = 0
        self.stopped: Optional[str] = None       # why the run had to end early, if it did
        self.last_error: Optional[str] = None
        self.sandbox = Sandbox(
            # Variables. The long input lives here, NOT in the root model's prompt.
            {"context": context, "documents": [{"name": name, "text": text} for name, text in documents]},
            # Plain functions the code can call.
            {"FINAL": self._final, "grep": self._grep, "chunks": self._chunks},
            # Helper-model calls: the recursion. Their answers come back as strings inside the sandbox.
            {"llm_query": self._llm_query, "llm_query_batch": self._llm_query_batch},
        )

    async def execute(self, code: str) -> str:
        """Run one code block; return what it printed (cut to what the model may see) and any error."""
        try:
            result = await asyncio.wait_for(self.sandbox.run(code), self.limits.step_timeout)
            output, self.last_error = result.output, result.error
        except asyncio.TimeoutError:
            output, self.last_error = "", "the step took too long"
        return _shown(output, self.last_error, self.limits.output_chars)

    def _final(self, answer: Any = "") -> None:
        """FINAL(answer): the model is done."""
        self.final_answer = _safe_str(answer)[:MAX_ANSWER_CHARS]

    async def _llm_query(self, prompt: str) -> str:
        """llm_query(prompt): one helper-model call. The helper sees only this prompt, so the code puts the piece of
        text to read into it."""
        if not isinstance(prompt, str):
            raise SandboxError("llm_query takes one string")
        await self._spend()
        if len(prompt) > self.limits.sub_chars:
            prompt = prompt[:self.limits.sub_chars] + "\n[The rest was cut: the prompt was too long.]"
        try:
            result = await self.llm.generate_response(prompt, prompts.SUB_SYSTEM, temperature=0.2, target=self.target)
        except LLMError as error:
            raise SandboxError(f"helper call failed: {error}") from None
        return result.content.strip()

    async def _llm_query_batch(self, prompt_list: List[str]) -> List[str]:
        """llm_query_batch(prompts): several helper calls at once, answers in the same order."""
        if not isinstance(prompt_list, (list, tuple)) or not all(isinstance(p, str) for p in prompt_list):
            raise SandboxError("llm_query_batch takes a list of strings")
        left = self.limits.max_sub_calls - self.sub_call_count
        if len(prompt_list) > left:
            raise SandboxError(f"that batch needs {len(prompt_list)} helper calls but only {left} are left; "
                               "use bigger chunks")
        gate = asyncio.Semaphore(self.limits.parallel)

        async def one(prompt: str) -> str:
            async with gate:
                return await self._llm_query(prompt)

        # Wait for every call before reporting a failure, so none keeps running after the step has ended.
        answers = await asyncio.gather(*(one(p) for p in prompt_list), return_exceptions=True)
        failure = next((a for a in answers if isinstance(a, BaseException)), None)
        if failure is not None:
            raise failure if isinstance(failure, SandboxError) else SandboxError(f"helper call failed: {failure}")
        return cast(List[str], answers)

    async def _spend(self) -> None:
        """Count one helper call; refuses once the run's budget or the user's daily allowance is used up."""
        if self.sub_call_count >= self.limits.max_sub_calls:
            raise SandboxError(f"all {self.limits.max_sub_calls} helper calls are used; answer with what you have")
        if not await self.charge():
            self.stopped = LIMIT_REACHED
            raise SandboxError("the daily AI limit was reached; answer with what you have")
        self.sub_call_count += 1

    def _grep(self, word: Any, text: Optional[str] = None) -> List[str]:
        """grep(word, text=context): the lines containing the word, as "line number: line"."""
        haystack = self.context if text is None else text
        if not isinstance(word, str) or not isinstance(haystack, str) or not word:
            raise SandboxError("grep takes a non-empty word and a text")
        needle = word.lower()
        hits = [f"{number}: {line[:GREP_LINE_CHARS]}" for number, line in enumerate(haystack.splitlines(), 1)
                if needle in line.lower()]
        return hits[:GREP_RESULTS] + ([f"[{len(hits) - GREP_RESULTS} more matches not listed]"]
                                      if len(hits) > GREP_RESULTS else [])

    def _chunks(self, text: Any, size: int = 20_000) -> List[str]:
        """chunks(text, size): the text cut into pieces of about `size` characters, at paragraph breaks."""
        if not isinstance(text, str) or not isinstance(size, int):
            raise SandboxError("chunks takes a text and a size in characters")
        return split_text(text, max(1_000, min(size, self.limits.sub_chars)), 0)
