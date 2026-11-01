# Deep read: the recursive language model (RLM)

A normal chat model reads only what fits in its prompt. A recursive language model never puts the long text in the
prompt at all. The text sits in a Python variable called `context`, and the model reads it by writing code, the way a
person would explore a huge file in a notebook.

## The loop

```
question + size + first lines
        │
        ▼
 ┌─ root model ──────── writes code ──────────┐
 │      ▲                                     ▼
 │      │                              REPL (sandbox)
 │  what the code                      context = "...the whole text..."
 │  printed                            grep, chunks, slicing, counting
 │      │                              llm_query(piece) ──► helper model reads one piece
 │      └──────────────────────────────  answers come back as variables
 │
 └─ FINAL(answer) ends it (or the steps run out)
```

1. The root model gets the question, the text's length and its first 1,500 characters. Nothing more.
2. It replies with code. The REPL runs it and returns only what the code printed.
3. It writes more code: look at a slice, `grep` a word, count lines, or cut the text into `chunks` and send each one
   to a helper model with `llm_query`. That is the "recursive" part: a model calling models.
4. It calls `FINAL(answer)`.

Exact questions ("how many engineers are in Tokyo?") are answered by code alone: zero helper calls, and the count is
exact, which a model reading 4,000 lines never is. Questions about meaning ("list every deadline") send chunks to
helpers and combine what they find.

Texts under 24,000 characters skip the loop: one direct call is cheaper and just as good.

## The files

| File | What it is | In the textbook notebook |
|---|---|---|
| [repl.py](repl.py) | `RLMRepl`: holds `context`, runs code, provides `FINAL`, `llm_query`, `llm_query_batch`, `grep`, `chunks` | `class RLMRepl` |
| [engine.py](engine.py) | `extract_code` and `run_rlm`: the loop above | `extract_code`, `run_rlm` |
| [prompts.py](prompts.py) | what the root and helper models are told (`root_system`: tools, strategy, rules) | `RLM_SYSTEM_PROMPT` |
| [sandbox.py](sandbox.py) | the interpreter that runs the model's code safely | `exec(code, namespace)` |

## What is different from the notebook version, and why

The notebook is a good way to learn RLM. Four of its shortcuts are unsafe or fragile in an app:

- **`exec()` is not a sandbox.** Python adds the full builtins to the namespace, so `import os`,
  `open(...)` and `__import__('os').system(...)` all work. A document can carry hidden instructions that make the
  model write that code (prompt injection). Here, `sandbox.py` parses the code and runs only an allow-list of plain
  Python: no imports, no `def`/`class`, no names with underscores, methods only on strings, lists and dicts.
- **No limits.** `while True: pass` would freeze the server. Here each run is capped at 5 seconds of computing,
  200,000 steps, 4 million characters per value and 20,000 characters of output.
- **Unlimited helper calls.** One question could make hundreds of paid calls. Here: at most 8 steps and 24 helper
  calls per question, each counted against the user's daily allowance, with up to 4 running at once.
- **Guessing code from prose.** The notebook runs the whole reply as code when it finds no code block. Here only
  ```` ``` ```` blocks are run.

The notebook's ideas are all kept: `context` as a variable, `print` as the only window, `llm_query` as recursion,
`FINAL` to finish (from code or written after it), and variables that persist between steps.

## See it run

From `backend/`:

```
python scripts/rlm_demo.py --offline
```

prints each iteration (the code the model wrote, what the REPL printed) and compares the answer with the truth. Set
`RLM_API_KEY` (an OpenRouter key) and drop `--offline` to run it with a real model.

In the app: open a long document, choose **Deep read** in the chat options, ask, and open **Read with code** under the
answer to see the same steps.
