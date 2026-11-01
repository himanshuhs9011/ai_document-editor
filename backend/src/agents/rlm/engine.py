"""Recursive reading (RLM): answer a question about a long text by letting a model explore it with code.

The whole method is the loop in run_rlm:
  1. The root model gets the question, the text's size and its opening lines. Never the whole text.
  2. It replies with code. The REPL (repl.py) runs it, with the text in the variable `context`.
  3. What the code printed goes back to the model, which writes more code: search, slice, chunk, and llm_query
     to have helper models read pieces closely. The helpers' answers stay in variables, out of the root's prompt.
  4. It ends when the model calls FINAL(answer), or when the steps run out.
Texts short enough to read at once skip the loop and get one direct call (RecursiveReader.read).
"""
import logging
import re
from dataclasses import dataclass
from typing import AsyncIterator, Awaitable, Callable, List, Optional, Tuple

from ...services.llm import LLMService, ModelTarget
from . import prompts
from .repl import LIMIT_REACHED, MAX_ANSWER_CHARS, Limits, RLMRepl
from .sandbox import Sandbox, _safe_str

logger = logging.getLogger(__name__)

CODE_BLOCK = re.compile(r"```(?:repl|python|py)?[ \t]*\n(.*?)```", re.DOTALL)
FINAL_VAR = re.compile(r"FINAL_VAR\(\s*([A-Za-z]\w*)\s*\)")
MAX_BLOCKS_PER_STEP = 3
OUT_OF_REQUESTS = "I ran out of AI requests before I could finish reading. Try again tomorrow or add your own API key."

__all__ = ["Corpus", "Limits", "RecursiveReader", "extract_code", "final_answer", "run_rlm"]


@dataclass
class Corpus:
    """What is being read: one or more named documents."""
    documents: List[Tuple[str, str]]

    @property
    def text(self) -> str:
        if len(self.documents) == 1:
            return self.documents[0][1]
        return "\n\n".join(f"=== Document: {name} ===\n{text}" for name, text in self.documents)


def extract_code(reply: str) -> List[str]:
    """The code blocks in the model's reply (at most three per step). Text outside a ``` block is never run, even if
    it looks like code: guessing would run the model's prose."""
    return CODE_BLOCK.findall(reply)[:MAX_BLOCKS_PER_STEP]


def final_answer(prose: str, sandbox: Sandbox) -> Optional[str]:
    """The answer from FINAL(...) or FINAL_VAR(name) written outside code (code blocks already removed)."""
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


async def run_rlm(question: str, corpus: Corpus, llm: LLMService, target: Optional[ModelTarget],
                  charge: Callable[[], Awaitable[bool]], limits: Limits = Limits()) -> AsyncIterator[dict]:
    """The RLM loop. Events: rlm (each code block run, for the progress view) and rlm_done (the answer)."""
    text = corpus.text
    repl = RLMRepl(text, corpus.documents, llm, target, charge, limits)

    # The first message holds the question and a preview. The text itself stays in the REPL.
    history = [
        {"role": "system", "content": prompts.root_system(len(text), text.count("\n") + 1, len(corpus.documents),
                                                          limits.max_sub_calls, limits.sub_chars, limits.output_chars)},
        {"role": "user", "content": prompts.root_first_turn(question, text[:limits.preview_chars], limits.max_turns)},
    ]
    answer: Optional[str] = None
    steps = 0
    for iteration in range(1, limits.max_turns + 1):
        if iteration > 1 and not await charge():
            repl.stopped = LIMIT_REACHED
            break
        steps = iteration

        # 1. Ask the root model for code.
        reply = (await llm.converse(history, temperature=0.2, target=target)).content
        history.append({"role": "assistant", "content": reply})

        # 2. Run each code block in the REPL.
        blocks = extract_code(reply)
        outputs = []
        for code in blocks:
            output = await repl.execute(code)
            outputs.append(output)
            yield {"event": "rlm", "data": {"step": iteration, "code": code.strip()[:4_000], "output": output[:1_500],
                                            "error": repl.last_error, "sub_calls": repl.sub_call_count}}
            if repl.final_answer is not None:
                break

        # 3. Done when FINAL was called, in the code or written after it.
        answer = repl.final_answer or final_answer(CODE_BLOCK.sub("", reply), repl.sandbox)
        if answer is not None or repl.stopped:
            break

        # 4. Otherwise feed the output back and go round again.
        history.append({"role": "user", "content": prompts.root_observation("\n\n".join(outputs), limits.max_turns - iteration)
                        if blocks else prompts.NO_CODE})

    if answer is None and not repl.stopped and await charge():
        # Out of steps: one last turn without code to write up what was found.
        reply = (await llm.converse(history + [{"role": "user", "content": prompts.LAST_CALL}],
                                    temperature=0.2, target=target)).content
        prose = CODE_BLOCK.sub("", reply)
        answer = final_answer(prose, repl.sandbox) or prose.strip()
        steps += 1
    yield {"event": "rlm_done", "data": {"answer": answer or OUT_OF_REQUESTS, "steps": steps,
                                         "sub_calls": repl.sub_call_count, "mode": "recursive", "stopped": repl.stopped}}


class RecursiveReader:
    def __init__(self, llm: LLMService, limits: Limits = Limits()):
        self.llm = llm
        self.limits = limits

    async def read(self, question: str, corpus: Corpus, target: Optional[ModelTarget],
                   charge: Callable[[], Awaitable[bool]]) -> AsyncIterator[dict]:
        """Short texts are read in one call; longer ones go through the RLM loop."""
        text = corpus.text
        if len(text) <= self.limits.direct_chars:
            yield {"event": "rlm", "data": {"step": 0, "note": "Read the whole text in one pass."}}
            result = await self.llm.generate_response(prompts.direct_prompt(question, text), prompts.DIRECT_SYSTEM,
                                                      temperature=0.2, target=target)
            yield {"event": "rlm_done", "data": {"answer": result.content, "steps": 1, "sub_calls": 0, "mode": "direct"}}
            return
        async for event in run_rlm(question, corpus, self.llm, target, charge, self.limits):
            yield event
