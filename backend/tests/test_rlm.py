"""The RLM sandbox must refuse every escape and resource attack, and the reader must reach an answer."""
import asyncio
import unittest

from src.agents.rlm.engine import Corpus, Limits, RecursiveReader, final_answer
from src.agents.rlm.sandbox import Sandbox
from src.models.schemas import LLMResponse


def run(code: str, sandbox: Sandbox = None):
    sandbox = sandbox or Sandbox({"context": "alpha\nbeta deadline 5 May\ngamma"}, {}, {})
    return asyncio.run(sandbox.run(code)), sandbox


class SandboxEscapes(unittest.TestCase):
    ATTACKS = [
        "().__class__.__bases__[0].__subclasses__()",
        "import os",
        "from os import system",
        "__import__('os')",
        "eval('1+1')",
        "exec('x=1')",
        "open('/etc/passwd')",
        "getattr(1, 'real')",
        "globals()",
        "type(1)",
        "'{0.__class__}'.format(1)",
        "f'{context:>99999999}'",
        "(lambda: 1)()",
        "def f():\n    return 1",
        "class A:\n    pass",
        "try:\n    x = 1\nexcept Exception:\n    pass",
        "with open('x') as f:\n    pass",
        "(1).bit_length()",
        "context.encode()",
        "str.lower('A')",
        "x = len\nx.__self__",
        "f = llm_query",
        "sorted([1], key=llm_query)",
        "len = 5",
        "b'bytes'",
        "'%*d' % (99999999, 1)",
        "print(*[1, 2])",
        "dict(**{'a': 1})",
    ]

    def test_every_escape_is_refused(self):
        sandbox = Sandbox({"context": "text"}, {}, {"llm_query": self._never_called})
        for code in self.ATTACKS:
            with self.subTest(code=code):
                result = asyncio.run(sandbox.run(code))
                self.assertIsNotNone(result.error, f"{code!r} should have been refused")

    async def _never_called(self, *args):
        raise AssertionError("helper must not run")


class SandboxLimits(unittest.TestCase):
    def assert_refused(self, code: str, words: str):
        result, _ = run(code)
        self.assertIsNotNone(result.error, code)
        self.assertIn(words, result.error)

    def test_infinite_loop_stops(self):
        self.assert_refused("while True:\n    pass", "ran too long")

    def test_huge_repetition(self):
        self.assert_refused("'a' * 10000000000", "too large")

    def test_replace_blowup(self):
        self.assert_refused("s = 'a' * 3000000\ns.replace('', 'bb')", "replace")

    def test_join_blowup(self):
        self.assert_refused("s = 'a' * 3000000\n''.join([s, s])", "join")

    def test_fstring_blowup(self):
        self.assert_refused("s = 'a' * 3000000\nt = f'{s}{s}'", "f-string")

    def test_stringifying_a_huge_list(self):
        self.assert_refused("big = 'x' * 1000000\nitems = [big] * 100\nstr(items)", "too large")

    def test_print_of_a_huge_list(self):
        self.assert_refused("big = 'x' * 1000000\nprint([big] * 100)", "too large")

    def test_list_doubling_in_place(self):
        self.assert_refused("l = [1]\nfor i in range(30):\n    l.extend(l)", "items")

    def test_sum_of_lists(self):
        self.assert_refused("sum([[1]], [])", "numbers")

    def test_integer_growth(self):
        self.assert_refused("n = 3\nfor i in range(30):\n    n = n * n", "too large")

    def test_huge_range(self):
        self.assert_refused("range(10000000000)", "range")

    def test_heavy_builtins_hit_the_compute_budget(self):
        self.assert_refused("big = list(range(1000000))\nfor i in range(100000):\n    s = sorted(big, reverse=True)", "seconds of computing")

    def test_print_separator_is_size_checked(self):
        self.assert_refused("big = 'x' * 1000000\nprint(1, 2, sep=[big] * 100)", "too large")

    def test_other_requests_keep_moving_while_code_runs(self):
        async def scenario():
            ticks = []

            async def other_request():
                for _ in range(20):
                    ticks.append(1)
                    await asyncio.sleep(0)

            sandbox = Sandbox({}, {}, {})
            await asyncio.gather(sandbox.run("total = 0\nfor i in range(30000):\n    total += i"), other_request())
            return ticks

        self.assertEqual(len(asyncio.run(scenario())), 20)


class SandboxLanguage(unittest.TestCase):
    def test_everyday_code_works(self):
        code = "\n".join([
            "lines = context.splitlines()",
            "hits = [l for l in lines if 'deadline' in l.lower()]",
            "counts = {w: len(w) for w in ['a', 'bb']}",
            "total = 0",
            "for i, line in enumerate(lines):",
            "    if i == 2:",
            "        break",
            "    total += len(line)",
            "print(len(lines), hits[0][:12], counts['bb'], total, f'{3.14159:.2f}', sorted(['b', 'a'], reverse=True))",
        ])
        result, _ = run(code)
        self.assertIsNone(result.error, result.error)
        self.assertEqual(result.output.strip(), "3 beta deadlin 2 24 3.14 ['b', 'a']")

    def test_variables_persist_between_runs(self):
        sandbox = Sandbox({}, {"grep": lambda word: [word]}, {})
        first, _ = run("found = grep('deadline')", sandbox)
        self.assertIsNone(first.error)
        result, _ = run("print(found)", sandbox)
        self.assertEqual(result.output.strip(), "['deadline']")

    def test_comprehension_conditions_short_circuit(self):
        result, _ = run("print([x for x in [None, 2, 1] if x is not None if x > 1])")
        self.assertEqual(result.output.strip(), "[2]")

    def test_printing_many_large_values_stays_small(self):
        args = ", ".join(["big"] * 2000)
        result, _ = run(f"big = 'x' * 3000000\nprint({args})")
        self.assertIsNone(result.error)
        self.assertEqual(len(result.output), 20_000)

    def test_print_output_is_capped(self):
        result, _ = run("for i in range(5000):\n    print('line of output', i)")
        self.assertLessEqual(len(result.output), 20_000)


class FakeLLM:
    """Root replies are scripted; helper calls answer from the chunk they were given."""

    def __init__(self, root_replies):
        self.root_replies = list(root_replies)
        self.helper_prompts = []

    async def converse(self, messages, temperature=0.7, max_tokens=None, target=None):
        return LLMResponse(content=self.root_replies.pop(0), model="fake", tokens_used=0, processing_time=0)

    async def generate_response(self, prompt, system_prompt=None, temperature=0.7, max_tokens=None, target=None):
        self.helper_prompts.append(prompt)
        found = "5 May" if "5 May" in prompt else "Not found in this part."
        return LLMResponse(content=found, model="fake", tokens_used=0, processing_time=0)


async def collect(reader, question, corpus, charge):
    return [event async for event in reader.read(question, corpus, None, charge)]


async def always():
    return True


class ReaderLoop(unittest.TestCase):
    LONG = ("filler paragraph about nothing in particular.\n\n" * 1500) + "The filing deadline is 5 May.\n\n" + ("more filler.\n\n" * 500)

    def test_recursive_read_reaches_final_var(self):
        llm = FakeLLM([
            "Let me split it.\n```repl\nparts = chunks(context, 20000)\nanswers = llm_query_batch(['When is the deadline?\\n' + p for p in parts])\n"
            "found = [a for a in answers if 'Not found' not in a]\nprint(len(parts), found)\n```",
            "FINAL_VAR(found)",
        ])
        events = asyncio.run(collect(RecursiveReader(llm), "When is the deadline?", Corpus([("brief.txt", self.LONG)]), always))
        done = events[-1]["data"]
        self.assertEqual(done["mode"], "recursive")
        self.assertIn("5 May", done["answer"])
        self.assertGreater(done["sub_calls"], 1)
        self.assertTrue(all(len(p) <= 61_000 for p in llm.helper_prompts))

    def test_short_text_is_read_directly(self):
        llm = FakeLLM([])
        events = asyncio.run(collect(RecursiveReader(llm), "When?", Corpus([("a.txt", "Deadline 5 May.")]), always))
        self.assertEqual(events[-1]["data"]["mode"], "direct")
        self.assertEqual(len(llm.helper_prompts), 1)

    def test_out_of_steps_asks_for_a_final_answer(self):
        llm = FakeLLM(["```repl\nprint(len(context))\n```"] * 2 + ["FINAL(It is on 5 May.)"])
        events = asyncio.run(collect(RecursiveReader(llm, Limits(max_turns=2)), "When?", Corpus([("a", self.LONG)]), always))
        self.assertEqual(events[-1]["data"]["answer"], "It is on 5 May.")

    def test_daily_limit_stops_helper_calls(self):
        async def broke():
            return False
        llm = FakeLLM(["```repl\nx = llm_query('When? ' + context[:100])\n```", "FINAL(unused)"])
        events = asyncio.run(collect(RecursiveReader(llm), "When?", Corpus([("a", self.LONG)]), broke))
        done = events[-1]["data"]
        self.assertEqual(done["stopped"], "Stopped early: the daily AI limit was reached.")
        self.assertEqual(llm.helper_prompts, [])
        self.assertIn("daily AI limit", events[0]["data"]["output"])

    def test_helper_budget_is_enforced(self):
        llm = FakeLLM(["```repl\nr = llm_query_batch(['q'] * 30)\n```", "FINAL(done)"])
        events = asyncio.run(collect(RecursiveReader(llm), "q", Corpus([("a", self.LONG)]), always))
        self.assertIn("only 24 are left", events[0]["data"]["output"])
        self.assertEqual(llm.helper_prompts, [])

    def test_final_ignores_code_and_reads_nested_parentheses(self):
        sandbox = Sandbox({}, {}, {})
        self.assertEqual(final_answer("Done. FINAL(Pay (in full) by 5 May.)", sandbox), "Pay (in full) by 5 May.")
        self.assertIsNone(final_answer("still working", sandbox))


if __name__ == "__main__":
    unittest.main()
