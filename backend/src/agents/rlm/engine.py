"""Recursive reading (RLM): answer a question about a long text by letting a model explore it with code.

The text never goes into a prompt whole. The root model sees its size and opening lines, writes code that runs in
the sandbox (where the text is the variable `context`), reads the printed output, and hands pieces to helper models
with llm_query. It ends with FINAL(answer). Texts short enough to read at once skip this and get one direct call.
"""
import asyncio
import logging
import re
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Awaitable, Callable, List, Optional, Tuple

from ...services.llm import LLMError, LLMService, ModelTarget
from ...services.retrieval import split_text
from . import prompts
from .sandbox import Sandbox, SandboxError, _safe_str

logger = logging.getLogger(__name__)

CODE_BLOCK = re.compile(r"```(?:repl|python|py)?[ \t]*\n(.*?)```", re.DOTALL)
FINAL_VAR = re.compile(r"FINAL_VAR\(\s*([A-Za-z]\w*)\s*\)")
LIMIT_REACHED = "Stopped early: the daily AI limit was reached."
MAX_BLOCKS_PER_STEP = 3
MAX_ANSWER_CHARS = 20_000
GREP_RESULTS = 200
GREP_LINE_CHARS = 300


@dataclass(frozen=True)
class Limits:
    max_turns: int = 8
    max_sub_calls: int = 24
    sub_chars: int = 60_000
    output_chars: int = 4_000
    direct_chars: int = 24_000
    preview_chars: int = 1_500
    parallel: int = 4
    step_timeout: float = 300.0


@dataclass
class Corpus:
    """What is being read: one or more named documents."""
    documents: List[Tuple[str, str]]

    @property
    def text(self) -> str:
        if len(self.documents) == 1:
            return self.documents[0][1]
        return "\n\n".join(f"=== Document: {name} ===\n{text}" for name, text in self.documents)


@dataclass
class _Budget:
    limit: int
    charge: Callable[[], Awaitable[bool]]
    used: int = 0
    stopped: Optional[str] = None

    async def spend(self) -> None:
        """Count one helper call; refuses once the run's budget or the user's daily allowance is used up."""
        if self.used >= self.limit:
            raise SandboxError(f"all {self.limit} helper calls are used; answer with what you have")
        if not await self.charge():
            self.stopped = LIMIT_REACHED
            raise SandboxError("the daily AI limit was reached; answer with what you have")
        self.used += 1


def final_answer(prose: str, sandbox: Sandbox) -> Optional[str]:
    """The answer from FINAL(...) or FINAL_VAR(name) in the model's reply (code blocks already removed)."""
    match = FINAL_VAR.search(prose)
    if match:
        value = sandbox.get(match.group(1))
        return None if value is None else _safe_str(value)[:MAX_ANSWER_CHARS]
    start = prose.find("FINAL(")
    if start == -1:
        return None
    body = prose[start + len("FINAL("):]
    end = body.rfind(")")
    return (body[:end] if end != -1 else body).strip()[:MAX_ANSWER_CHARS]


def _shown(output: str, error: Optional[str], limit: int) -> str:
    text = output if len(output) <= limit else output[:limit] + f"\n[... {len(output) - limit:,} more characters not shown]"
    if error:
        text = f"{text}\nError: {error}" if text.strip() else f"Error: {error}"
    return text.strip() or "(no output; use print to see values)"


class RecursiveReader:
    def __init__(self, llm: LLMService, limits: Limits = Limits()):
        self.llm = llm
        self.limits = limits

    async def read(self, question: str, corpus: Corpus, target: ModelTarget,
                   charge: Callable[[], Awaitable[bool]]) -> AsyncIterator[dict]:
        """Events: rlm (each step, for the progress view) and rlm_done (the answer)."""
        text = corpus.text
        if len(text) <= self.limits.direct_chars:
            yield {"event": "rlm", "data": {"step": 0, "note": "Read the whole text in one pass."}}
            result = await self.llm.generate_response(prompts.direct_prompt(question, text), prompts.DIRECT_SYSTEM,
                                                      temperature=0.2, target=target)
            yield {"event": "rlm_done", "data": {"answer": result.content, "steps": 1, "sub_calls": 0, "mode": "direct"}}
            return
        async for event in self._recursive(question, corpus, text, target, charge):
            yield event

    def _sandbox(self, corpus: Corpus, full_text: str, target: ModelTarget, budget: _Budget) -> Sandbox:
        async def ask(prompt: str) -> str:
            if not isinstance(prompt, str):
                raise SandboxError("llm_query takes one string")
            await budget.spend()
            if len(prompt) > self.limits.sub_chars:
                prompt = prompt[:self.limits.sub_chars] + "\n[The rest was cut: the prompt was too long.]"
            try:
                result = await self.llm.generate_response(prompt, prompts.SUB_SYSTEM, temperature=0.2, target=target)
            except LLMError as error:
                raise SandboxError(f"helper call failed: {error}") from None
            return result.content.strip()

        async def llm_query(prompt: str) -> str:
            return await ask(prompt)

        async def llm_query_batch(prompt_list: List[str]) -> List[str]:
            if not isinstance(prompt_list, (list, tuple)) or not all(isinstance(p, str) for p in prompt_list):
                raise SandboxError("llm_query_batch takes a list of strings")
            left = self.limits.max_sub_calls - budget.used
            if len(prompt_list) > left:
                raise SandboxError(f"that batch needs {len(prompt_list)} helper calls but only {left} are left; "
                                   "use bigger chunks")
            gate = asyncio.Semaphore(self.limits.parallel)

            async def one(prompt: str) -> str:
                async with gate:
                    return await ask(prompt)

            # Wait for every call before reporting a failure, so none keeps running after the step has ended.
            answers = await asyncio.gather(*(one(p) for p in prompt_list), return_exceptions=True)
            failure = next((a for a in answers if isinstance(a, BaseException)), None)
            if failure is not None:
                raise failure if isinstance(failure, SandboxError) else SandboxError(f"helper call failed: {failure}")
            return list(answers)

        def grep(word: Any, text: Optional[str] = None) -> List[str]:
            haystack = full_text if text is None else text
            if not isinstance(word, str) or not isinstance(haystack, str) or not word:
                raise SandboxError("grep takes a non-empty word and a text")
            needle = word.lower()
            hits = [f"{number}: {line[:GREP_LINE_CHARS]}" for number, line in enumerate(haystack.splitlines(), 1)
                    if needle in line.lower()]
            return hits[:GREP_RESULTS] + ([f"[{len(hits) - GREP_RESULTS} more matches not listed]"]
                                          if len(hits) > GREP_RESULTS else [])

        def chunks(text_to_split: Any, size: int = 20_000) -> List[str]:
            if not isinstance(text_to_split, str) or not isinstance(size, int):
                raise SandboxError("chunks takes a text and a size in characters")
            return split_text(text_to_split, max(1_000, min(size, self.limits.sub_chars)), 0)

        documents = [{"name": name, "text": body} for name, body in corpus.documents]
        return Sandbox({"context": full_text, "documents": documents}, {"grep": grep, "chunks": chunks},
                       {"llm_query": llm_query, "llm_query_batch": llm_query_batch})

    async def _recursive(self, question: str, corpus: Corpus, text: str, target: ModelTarget,
                         charge: Callable[[], Awaitable[bool]]) -> AsyncIterator[dict]:
        limits = self.limits
        budget = _Budget(limits.max_sub_calls, charge)
        sandbox = self._sandbox(corpus, text, target, budget)
        messages = [
            {"role": "system", "content": prompts.root_system(len(text), text.count("\n") + 1, len(corpus.documents),
                                                              limits.max_sub_calls, limits.sub_chars, limits.output_chars)},
            {"role": "user", "content": prompts.root_first_turn(question, text[:limits.preview_chars], limits.max_turns)},
        ]
        answer: Optional[str] = None
        steps = 0
        for turn in range(1, limits.max_turns + 1):
            if turn > 1 and not await charge():
                budget.stopped = LIMIT_REACHED
                break
            steps = turn
            reply = (await self.llm.converse(messages, temperature=0.2, target=target)).content
            blocks = CODE_BLOCK.findall(reply)[:MAX_BLOCKS_PER_STEP]
            outputs = []
            for code in blocks:
                try:
                    result = await asyncio.wait_for(sandbox.run(code), limits.step_timeout)
                    shown = _shown(result.output, result.error, limits.output_chars)
                    error = result.error
                except asyncio.TimeoutError:
                    error = "the step took too long"
                    shown = f"Error: {error}"
                outputs.append(shown)
                yield {"event": "rlm", "data": {"step": turn, "code": code.strip()[:4_000], "output": shown[:1_500],
                                                "error": error, "sub_calls": budget.used}}
            answer = final_answer(CODE_BLOCK.sub("", reply), sandbox)
            if answer is not None or budget.stopped:
                break
            messages.append({"role": "assistant", "content": reply})
            messages.append({"role": "user", "content": prompts.root_observation("\n\n".join(outputs), limits.max_turns - turn)
                             if blocks else prompts.NO_CODE})

        if answer is None and not budget.stopped and await charge():
            # Out of steps: one last turn without code to write up what was found.
            reply = (await self.llm.converse(messages + [{"role": "user", "content": prompts.LAST_CALL}],
                                             temperature=0.2, target=target)).content
            prose = CODE_BLOCK.sub("", reply)
            answer = final_answer(prose, sandbox) or prose.strip()
            steps += 1
        if answer is None:
            answer = "I ran out of AI requests before I could finish reading. Try again tomorrow or add your own API key."
        yield {"event": "rlm_done", "data": {"answer": answer, "steps": steps, "sub_calls": budget.used,
                                             "mode": "recursive", "stopped": budget.stopped}}
