"""Watch the RLM loop step by step: the same engine the app's Deep read uses, printed like a notebook.

The task: count how many people in a long list are engineers based in Tokyo. The list is far too long to paste into
one prompt, so the model gets only its size and first lines, writes code, and sees what the code prints.

Usage (from backend/):
  python scripts/rlm_demo.py --offline
      A scripted model, no API key needed: shows the loop exactly, for explaining it.
  set RLM_API_KEY=sk-or-...  then  python scripts/rlm_demo.py
      A real model through OpenRouter. Change it with RLM_MODEL, or RLM_BASE_URL for another OpenAI-compatible API
      (for example http://localhost:11434/v1 for Ollama).
"""
import argparse
import asyncio
import os
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.agents.rlm import Corpus, Limits, run_rlm  # noqa: E402
from src.models.schemas import LLMResponse  # noqa: E402
from src.services.llm import LLMService, ModelTarget  # noqa: E402

QUESTION = "Count exactly how many people are engineers based in Tokyo. Return just the number."
ROLES = ["engineer", "designer", "manager", "analyst", "writer"]
CITIES = ["Tokyo", "Osaka", "London", "Berlin", "Pune"]


def make_dataset(people: int = 4000, seed: int = 7):
    """A long list of people, and the true answer to the question."""
    rng = random.Random(seed)
    rows = [(f"Person {i:04d}", rng.choice(ROLES), rng.choice(CITIES)) for i in range(people)]
    text = "\n".join(f"Name: {name} | Role: {role} | City: {city}" for name, role, city in rows)
    return text, sum(1 for _, role, city in rows if role == "engineer" and city == "Tokyo")


class ScriptedModel:
    """Stands in for a real model with the replies a good one gives, so the loop can be shown offline."""
    REPLIES = [
        "First, the size and shape of the data.\n```repl\nprint(len(context))\nprint(context[:200])\n```",
        "One person per line, with role and city. Let code count them.\n```repl\n"
        "rows = [line for line in context.splitlines() if 'Role: engineer' in line and 'City: Tokyo' in line]\n"
        "print(len(rows))\nprint(rows[:3])\n```",
        "```repl\nFINAL(len(rows))\n```",
    ]

    def __init__(self):
        self.replies = list(self.REPLIES)

    async def converse(self, messages, temperature=0.7, max_tokens=None, target=None):
        return LLMResponse(content=self.replies.pop(0), model="scripted", tokens_used=0, processing_time=0)

    async def generate_response(self, prompt, system_prompt=None, temperature=0.7, max_tokens=None, target=None):
        return LLMResponse(content="Not found in this part.", model="scripted", tokens_used=0, processing_time=0)


def indent(text: str) -> str:
    return "\n".join(f"    {line}" for line in text.splitlines())


async def main(offline: bool) -> None:
    text, truth = make_dataset()
    print(f"Question: {QUESTION}")
    print(f"The text: {len(text):,} characters, {text.count(chr(10)) + 1:,} lines. The model never sees it whole.")

    if offline:
        llm, target, name = ScriptedModel(), None, "scripted model (offline)"
    else:
        key = os.environ.get("RLM_API_KEY") or os.environ.get("OPENROUTER_API_KEY")
        if not key:
            sys.exit("Set RLM_API_KEY (or OPENROUTER_API_KEY), or run with --offline.")
        model = os.environ.get("RLM_MODEL", "openai/gpt-4.1-mini")
        target = ModelTarget("openai", model, os.environ.get("RLM_BASE_URL", "https://openrouter.ai/api/v1"), key,
                             is_user_key=True)
        llm, name = LLMService(target, None, timeout=120, max_tokens=2_000), model

    async def charge() -> bool:
        return True  # the app counts each request against the user's daily allowance here

    print(f"Model: {name}")
    try:
        async for event in run_rlm(QUESTION, Corpus([("people.txt", text)]), llm, target, charge, Limits()):
            data = event["data"]
            if event["event"] == "rlm":
                print(f"\n{'=' * 60}\n  ITERATION {data['step']}   (helper calls so far: {data['sub_calls']})\n{'=' * 60}")
                print(f"\nThe model wrote:\n{indent(data['code'])}")
                print(f"\nThe REPL printed:\n{indent(data['output'])}")
            else:
                answer = data["answer"].strip()
                print(f"\n{'=' * 60}\n  RESULT\n{'=' * 60}")
                print(f"RLM answer:    {answer}")
                print(f"Ground truth:  {truth}")
                print(f"Correct:       {'yes' if str(truth) in answer else 'no'}")
                print(f"Iterations:    {data['steps']}")
                print(f"Helper calls:  {data['sub_calls']}")
    finally:
        if isinstance(llm, LLMService):
            await llm.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--offline", action="store_true", help="use a scripted model instead of a real one")
    asyncio.run(main(parser.parse_args().offline))
