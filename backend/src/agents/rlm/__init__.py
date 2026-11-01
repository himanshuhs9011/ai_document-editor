"""Recursive reading (RLM): a root model explores long text with code in a sandbox and calls helper models.

repl.py holds the REPL (the text as `context`, FINAL, llm_query), engine.py the loop (run_rlm), prompts.py what the
models are told, and sandbox.py the interpreter that runs the code safely. README.md walks through it.
"""
from .engine import Corpus, RecursiveReader, run_rlm
from .repl import Limits, RLMRepl

__all__ = ["Corpus", "Limits", "RLMRepl", "RecursiveReader", "run_rlm"]
