"""The agent harness: one LangGraph pipeline that runs any profession playbook.

plan (lead editor assigns sections to specialists) -> draft (each specialist writes its sections) ->
review (each reviewer critiques the whole draft; thorough runs only) -> revise (specialists fix flagged sections) ->
assemble (document, sources, review log, stock-phrase scan).
"""
import json
import logging
import re
from typing import Any, AsyncIterator, Awaitable, Callable, Dict, List, Optional, TypedDict

from langgraph.graph import END, StateGraph

from ...db import documents
from ...services.citations import SourceList
from ...services.llm import LLMService, ModelTarget
from ...services.retrieval import Retriever
from ...text.markdown import strip_code_fence, strip_preamble, truncate
from . import prompts
from .house_style import scan_stock_phrases
from .playbook import Format, Playbook

logger = logging.getLogger(__name__)

EXCERPT_CHARS = 600
WRITTEN_CONTEXT_CHARS = 3_000
REVIEW_DRAFT_CHARS = 14_000
PASSAGES_PER_SECTION = 5
MAX_ISSUES = 6
SEVERITIES = ("high", "medium", "low")
LIMIT_REACHED = "Stopped early: the daily AI limit was reached. What was written so far is included."


class RunState(TypedDict, total=False):
    playbook: Playbook
    format: Format
    brief: str
    thorough: bool
    user_id: str
    document_ids: List[str]
    target: ModelTarget
    charge: Callable[[], Awaitable[bool]]
    title: str
    outline: List[Dict[str, str]]
    index: int
    sections: List[str]
    sources: SourceList
    reviewer_index: int
    issues: List[Dict[str, Any]]
    revise_queue: List[int]
    revise_index: int
    stopped: bool
    markdown: str


def parse_json(raw: str) -> Dict[str, Any]:
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    try:
        value = json.loads(match.group(0)) if match else {}
    except json.JSONDecodeError:
        return {}
    return value if isinstance(value, dict) else {}


def parse_outline(raw: str, playbook: Playbook, fallback_title: str) -> Dict[str, Any]:
    """Read the planner's JSON; unknown specialists fall back to the first, bad JSON to a single section."""
    plan = parse_json(raw)
    known = {s.id for s in playbook.specialists}
    sections = []
    for item in plan.get("sections", []) if isinstance(plan.get("sections"), list) else []:
        if not isinstance(item, dict) or not str(item.get("title", "")).strip():
            continue
        specialist = str(item.get("specialist", ""))
        sections.append({"title": str(item["title"]).strip()[:200], "brief": str(item.get("brief", "")).strip()[:600],
                         "specialist": specialist if specialist in known else playbook.specialists[0].id})
    if not sections:
        sections = [{"title": "Draft", "brief": "the whole document", "specialist": playbook.specialists[0].id}]
    title = str(plan.get("title") or fallback_title).strip()[:200]
    return {"title": title, "sections": sections[:playbook.max_sections]}


def parse_issues(raw: str, section_count: int, reviewer_id: str) -> List[Dict[str, Any]]:
    issues = []
    for item in parse_json(raw).get("issues", []) or []:
        if not isinstance(item, dict) or not str(item.get("problem", "")).strip():
            continue
        try:
            section = int(item.get("section"))
        except (TypeError, ValueError):
            section = 0
        severity = str(item.get("severity", "medium")).lower()
        issues.append({
            "reviewer": reviewer_id,
            "section": section if 1 <= section <= section_count else None,
            "severity": severity if severity in SEVERITIES else "medium",
            "problem": str(item["problem"]).strip()[:500],
            "fix": str(item.get("fix", "")).strip()[:500],
            "resolved": False,
        })
    return issues[:MAX_ISSUES]


PREAMBLE_WINDOW = 300


def tidy_section(raw: str, title: str) -> str:
    """Drop chatter the model put before the section's heading; add the heading if it was left out."""
    text = strip_code_fence(strip_preamble(raw.strip()))
    heading = re.search(r"^#{1,6} ", text, re.MULTILINE)
    if heading and heading.start() < PREAMBLE_WINDOW:
        text = text[heading.start():]
    return text if text.startswith("#") else f"## {title}\n\n{text}"


class Harness:
    def __init__(self, llm: LLMService, retriever: Retriever):
        self.llm = llm
        self.retriever = retriever
        self.graph = self._build_graph()

    def _build_graph(self):
        graph = StateGraph(RunState)
        for name in ("plan", "draft", "review", "revise", "assemble"):
            graph.add_node(name, getattr(self, f"_{name}"))
        graph.set_entry_point("plan")
        graph.add_edge("plan", "draft")
        graph.add_conditional_edges("draft", self._after_draft, ["draft", "review", "assemble"])
        graph.add_conditional_edges("review", self._after_review, ["review", "revise", "assemble"])
        graph.add_conditional_edges("revise", self._after_revise, ["revise", "assemble"])
        graph.add_edge("assemble", END)
        return graph.compile()

    async def _call(self, state: RunState, prompt: str, system: str, temperature: float) -> Optional[str]:
        """One model call, counted against the user's quota; None when the limit is reached."""
        if not await state["charge"]():
            return None
        reply = await self.llm.generate_response(prompt, system_prompt=system, temperature=temperature, target=state["target"])
        return reply.content

    async def _plan(self, state: RunState) -> RunState:
        playbook = state["playbook"]
        excerpts = await documents.excerpts(state["document_ids"], EXCERPT_CHARS) if state["document_ids"] else []
        material = "\n".join(f"- {e['filename']}: {e['excerpt']}" for e in excerpts)
        reply = await self.llm.generate_response(
            prompts.plan(playbook, state["format"], state["brief"], material),
            system_prompt=prompts.planner_system(playbook), temperature=0.3, target=state["target"],
        )
        plan = parse_outline(reply.content, playbook, state["format"].name)
        return {"title": plan["title"], "outline": plan["sections"], "index": 0, "sections": [], "sources": SourceList(),
                "reviewer_index": 0, "issues": [], "revise_queue": [], "revise_index": 0, "stopped": False}

    async def _draft(self, state: RunState) -> RunState:
        playbook, section = state["playbook"], state["outline"][state["index"]]
        found = (await self.retriever.search_many(f"{section['title']}. {section['brief']}", state["user_id"],
                                                  state["document_ids"], PASSAGES_PER_SECTION)
                 if state["document_ids"] else [])
        numbered = state["sources"].add(found)
        prompt = prompts.draft(
            state["title"], state["format"], state["brief"],
            "\n".join(f"- {s['title']}" for s in state["outline"]),
            truncate("\n\n".join(state["sections"])[-WRITTEN_CONTEXT_CHARS:], WRITTEN_CONTEXT_CHARS),
            section["title"], section["brief"], SourceList.prompt_block(numbered),
        )
        text = await self._call(state, prompt, prompts.specialist_system(playbook, playbook.specialist(section["specialist"])), 0.6)
        if text is None:
            return {"stopped": True}
        return {"sections": state["sections"] + [tidy_section(text, section["title"])], "index": state["index"] + 1}

    def _after_draft(self, state: RunState) -> str:
        if state["stopped"]:
            return "assemble"
        if state["index"] < len(state["outline"]):
            return "draft"
        return "review" if state["thorough"] and state["playbook"].reviewers else "assemble"

    async def _review(self, state: RunState) -> RunState:
        playbook = state["playbook"]
        reviewer = playbook.reviewers[state["reviewer_index"]]
        numbered = "\n\n".join(f"[S{i}]\n{text}" for i, text in enumerate(state["sections"], start=1))
        text = await self._call(state, prompts.review(truncate(numbered, REVIEW_DRAFT_CHARS)),
                                prompts.reviewer_system(playbook, reviewer), 0.2)
        if text is None:
            return {"stopped": True}
        found = parse_issues(text, len(state["sections"]), reviewer.id)
        return {"issues": state["issues"] + found, "reviewer_index": state["reviewer_index"] + 1}

    def _after_review(self, state: RunState) -> str:
        if state["stopped"]:
            return "assemble"
        if state["reviewer_index"] < len(state["playbook"].reviewers):
            return "review"
        return "revise" if self._flagged(state) else "assemble"

    @staticmethod
    def _flagged(state: RunState) -> List[int]:
        return sorted({i["section"] for i in state["issues"] if i["section"] and i["severity"] in ("high", "medium")})

    async def _revise(self, state: RunState) -> RunState:
        queue = state["revise_queue"] or self._flagged(state)
        number = queue[state["revise_index"]]
        playbook, section = state["playbook"], state["outline"][number - 1]
        notes = [i for i in state["issues"] if i["section"] == number and i["severity"] in ("high", "medium")]
        text = await self._call(state, prompts.revise(state["sections"][number - 1], notes),
                                prompts.specialist_system(playbook, playbook.specialist(section["specialist"])), 0.4)
        if text is None:
            return {"stopped": True, "revise_queue": queue}
        sections = list(state["sections"])
        sections[number - 1] = tidy_section(text, section["title"])
        issues = [{**i, "resolved": True} if i in notes else i for i in state["issues"]]
        return {"sections": sections, "issues": issues, "revise_queue": queue, "revise_index": state["revise_index"] + 1}

    def _after_revise(self, state: RunState) -> str:
        if state["stopped"] or state["revise_index"] >= len(state["revise_queue"]):
            return "assemble"
        return "revise"

    async def _assemble(self, state: RunState) -> RunState:
        parts = [f"# {state['title']}", *state["sections"]]
        cited = state["sources"].public()
        if cited:
            parts.append("## Sources\n\n" + "\n".join(f"[{s['n']}] {s['filename']}" for s in cited))
        return {"markdown": "\n\n".join(parts)}

    async def run(self, playbook: Playbook, fmt: Format, brief: str, thorough: bool, user_id: str,
                  document_ids: List[str], target: ModelTarget, charge: Callable[[], Awaitable[bool]]) -> AsyncIterator[dict]:
        """Server-sent events: plan, draft, review, revise, done (or error)."""
        state: RunState = {"playbook": playbook, "format": fmt, "brief": brief, "thorough": thorough, "user_id": user_id,
                           "document_ids": document_ids, "target": target, "charge": charge}
        sources, issues, stopped = SourceList(), [], False
        try:
            async for update in self.graph.astream(state, {"recursion_limit": 60}, stream_mode="updates"):
                for node, change in update.items():
                    stopped = stopped or bool(change.get("stopped"))
                    issues = change.get("issues", issues)
                    if node == "plan":
                        sources = change["sources"]
                        yield {"event": "plan", "data": {"title": change["title"], "sections": [
                            {"title": s["title"], "specialist": s["specialist"]} for s in change["outline"]]}}
                    elif node == "draft" and "sections" in change:
                        yield {"event": "draft", "data": {"index": change["index"] - 1, "markdown": change["sections"][-1]}}
                    elif node == "review" and "reviewer_index" in change:
                        reviewer = playbook.reviewers[change["reviewer_index"] - 1]
                        yield {"event": "review", "data": {"reviewer": reviewer.id,
                                                           "issues": [i for i in issues if i["reviewer"] == reviewer.id]}}
                    elif node == "revise" and "revise_index" in change and not change.get("stopped"):
                        number = change["revise_queue"][change["revise_index"] - 1]
                        yield {"event": "revise", "data": {"index": number - 1, "markdown": change["sections"][number - 1]}}
                    elif node == "assemble":
                        yield {"event": "done", "data": {
                            "markdown": change["markdown"], "sources": sources.public(), "issues": issues,
                            "stock_phrases": scan_stock_phrases(change["markdown"]), "notice": playbook.notice,
                            "warning": LIMIT_REACHED if stopped else "",
                        }}
        except Exception as error:
            logger.exception("Harness run failed")
            yield {"event": "error", "data": {"message": f"The document could not be written: {error}"}}
