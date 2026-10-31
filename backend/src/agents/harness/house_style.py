"""Writing rules every specialist follows, and a mechanical scan for the stock phrases that make text read as machine-made."""
import re
from typing import Dict, List

HOUSE_RULES = """House rules for every word you write:
- Write like an experienced practitioner talking to a peer: specific nouns, active verbs, plain words, varied sentence length.
- Never invent facts, figures, names, quotes, studies, statutes, case law, doses or sources. When something is missing,
  write a visible placeholder such as [TODO: client's registered address] or mark the claim [verify].
- Cite material from the numbered sources as [n] right after the claim it supports. Never cite a number you were not given.
- No stock phrasing: never use "delve", "tapestry", "testament to", "in today's fast-paced world", "ever-evolving",
  "it's important to note", "it is worth noting", "navigate the complexities", "unlock", "unleash", "elevate", "seamless",
  "robust", "game-changer", "cutting-edge", "revolutionize", "embark on a journey", "plays a pivotal role",
  "in conclusion", "at the end of the day", "a myriad of", "when it comes to".
- No "not just X, but Y" contrasts, no openers that are rhetorical questions, no lists of three by reflex, no summary
  paragraph that repeats what was just said.
- Return Markdown only: no preamble ("Sure", "Here is"), no notes to the user, no code fences."""

STOCK_PHRASES = (
    "delve", "tapestry", "testament to", "fast-paced world", "ever-evolving", "it's important to note",
    "it is important to note", "it is worth noting", "navigate the complexities", "navigating the complexities",
    "unlock", "unleash", "elevate", "seamless", "robust", "game-changer", "game changer", "cutting-edge",
    "revolutionize", "embark on", "pivotal role", "in conclusion", "at the end of the day", "a myriad of",
    "when it comes to", "in the realm of", "harness the power", "look no further", "rest assured",
)


def scan_stock_phrases(text: str) -> List[Dict[str, int]]:
    """Count stock phrases in the finished document so the user sees what slipped through."""
    lowered = text.lower()
    found = []
    for phrase in STOCK_PHRASES:
        count = len(re.findall(rf"\b{re.escape(phrase)}\b", lowered))
        if count:
            found.append({"phrase": phrase, "count": count})
    return found
