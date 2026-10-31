"""The chat pipeline: decide what the user wants, build the prompt, generate (whole or streamed), clean up, save.

Every reply has a kind: "document" (a proposed new version of the document, which the editor shows for review)
or "answer" (shown in the chat). Answers searched across all documents carry numbered sources.
"""
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import AsyncIterator, Awaitable, Callable, List, Optional, Tuple

from ..agents import prompts
from ..agents.rlm import Corpus, RecursiveReader
from ..db import documents, messages
from ..models.schemas import ChatRequest
from ..text import intent
from ..text.guardrails import UnsafeOutput, guard_output
from ..text.markdown import (
    fix_markdown_formatting, html_to_markdown, html_to_text, looks_like_html,
    strip_preamble, strip_template_markers, truncate,
)
from ..text.placeholders import extract_details, fill_placeholders, has_placeholders, known_details, normalize_placeholders
from .citations import SourceList
from .llm import LLMService, ModelTarget
from .retrieval import MAX_DOCUMENTS, Retriever

logger = logging.getLogger(__name__)

SUMMARY_TAG = "[AUTO-SUMMARY]"
SUMMARIZE_AFTER = 10
RECENT_MESSAGES = 2
DOCUMENT_CONTEXT_CHARS = 8000
RETRIEVED_CONTEXT_CHARS = 6000
DEEP_DOCUMENT_CHARS = 2_000_000
DEEP_TOTAL_CHARS = 3_000_000
DOCUMENT, ANSWER = "document", "answer"
LLM_UNAVAILABLE = "I'm sorry, the AI service is not available right now. Please try again shortly."
NOTHING_FOUND = "I couldn't find anything about that in your documents."
NOTHING_TO_READ = "There is no document text to read yet. Open or upload a document, then ask again."

Charge = Callable[[], Awaitable[bool]]


async def _never() -> bool:
    return False


@dataclass
class ChatPlan:
    """What to send to the model, or a ready reply when no model call is needed."""
    session_id: str
    kind: str
    prompt: str = ""
    temperature: float = 0.3
    strict: bool = True
    reply: Optional[dict] = None
    sources: List[dict] = field(default_factory=list)


def _reply(session_id: str, text: str, kind: str = ANSWER, **extra) -> dict:
    return {"response": text, "kind": kind, "timestamp": datetime.now().isoformat(), "session_id": session_id, **extra}


def _transcript(history: List[dict]) -> str:
    return "\n".join(f"{m.get('role', 'unknown')}: {m.get('content', '')}" for m in history)


def _collapse(text: str) -> str:
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def clean_model_output(raw: str, strict: bool = True) -> str:
    """Normalize model output into editor-ready Markdown; strict mode also strips preambles."""
    text = _collapse(normalize_placeholders(raw))
    if looks_like_html(text):
        text = html_to_markdown(text)
    text = strip_template_markers(fix_markdown_formatting(text))
    return guard_output(strip_preamble(text) if strict else text)


def document_context(raw: Optional[str]) -> Tuple[str, str]:
    """Return (plain text truncated for the prompt, full Markdown) for the editor content."""
    if not raw or not raw.strip():
        return "", ""
    markdown = html_to_markdown(raw) if looks_like_html(raw) else raw
    text = html_to_text(markdown)
    if len(text) <= 10:
        return "", ""
    return truncate(text, DOCUMENT_CONTEXT_CHARS), markdown


class ChatService:
    def __init__(self, llm: LLMService, retriever: Retriever):
        self.llm = llm
        self.retriever = retriever
        self.reader = RecursiveReader(llm)

    @staticmethod
    def _is_deep(request: ChatRequest) -> bool:
        return request.mode == "deep" and intent.TOOLBAR_MARKER not in request.content.lower()

    async def handle(self, request: ChatRequest, session_id: str, user_id: str, target: ModelTarget,
                     charge: Charge = _never) -> dict:
        try:
            if self._is_deep(request):
                reply: dict = {}
                async for event in self.deep_read(request, session_id, user_id, target, charge):
                    if event["event"] == "done":
                        reply = event["data"]
                return reply
            plan = await self.prepare(request, session_id, user_id, target)
            if plan.reply:
                return plan.reply
            result = await self.llm.generate_response(plan.prompt, temperature=plan.temperature, target=target)
            return await self.finish(plan, result.content)
        except Exception as error:
            logger.exception("Chat failed")
            return await self._save_reply(session_id, f"Sorry, I encountered an error: {error}")

    async def stream(self, request: ChatRequest, session_id: str, user_id: str,
                     target: ModelTarget, charge: Charge = _never) -> AsyncIterator[dict]:
        """Server-sent events: meta (kind), delta (text as it is written), rlm (deep-read steps), done (final reply)."""
        try:
            if self._is_deep(request):
                async for event in self.deep_read(request, session_id, user_id, target, charge):
                    yield event
                return
            plan = await self.prepare(request, session_id, user_id, target)
            yield {"event": "meta", "data": {"session_id": session_id, "kind": plan.kind}}
            if plan.reply:
                yield {"event": "done", "data": plan.reply}
                return
            parts = []
            async for text in self.llm.stream(plan.prompt, temperature=plan.temperature, target=target):
                parts.append(text)
                yield {"event": "delta", "data": {"text": text}}
            yield {"event": "done", "data": await self.finish(plan, "".join(parts))}
        except Exception as error:
            logger.exception("Chat stream failed")
            yield {"event": "error", "data": {"message": f"Sorry, I encountered an error: {error}"}}

    async def prepare(self, request: ChatRequest, session_id: str, user_id: str, target: ModelTarget) -> ChatPlan:
        message = request.content
        if not message.strip():
            return ChatPlan(session_id, ANSWER, reply=_reply(session_id, "Please provide a message."))
        await messages.add(session_id, "user", message)
        text = message.lower().strip()
        is_toolbar = intent.TOOLBAR_MARKER in text
        history = await messages.list_for_session(session_id)
        doc_text, doc_markdown = document_context(request.document_content)

        if intent.wants_clear_summary(text):
            reply = await self._save_reply(session_id, "Conversation summary cleared. Future conversations will start fresh.")
            return ChatPlan(session_id, ANSWER, reply=reply)
        if intent.wants_summary(text) and not is_toolbar and (not doc_text or "chat" in text or "conversation" in text):
            return ChatPlan(session_id, ANSWER, reply=await self._summarize(session_id, history, target))
        if request.scope == "all" and not is_toolbar:
            return await self._plan_workspace_answer(session_id, user_id, message)

        if is_toolbar:
            if not doc_text:
                selection = re.search(r"Selected passage:\s*(.*)", message, re.DOTALL)
                doc_text = selection.group(1).strip() if selection else ""
            return ChatPlan(session_id, DOCUMENT, self._toolbar_prompt(message, doc_text), temperature=0.3, strict=False)

        details = extract_details(message)
        remembered = await known_details(session_id, details)
        placeholder_source = doc_markdown or doc_text
        route = intent.detect_intent(text, bool(doc_text), bool(remembered), has_placeholders(placeholder_source))
        if route == "fill_placeholders":
            filled = fill_placeholders(placeholder_source, remembered)
            if filled != placeholder_source:
                return ChatPlan(session_id, DOCUMENT, reply=await self._fill_reply(session_id, filled, route))

        passages = await self._passages(request.document_id, user_id, message)
        if doc_text and route != "modify_document" and intent.wants_answer(text):
            prompt = prompts.answer_from_document(doc_text, passages, _transcript(history[-4:-1]), message)
            return ChatPlan(session_id, ANSWER, prompt, temperature=0.3)

        context = await self._context(session_id, history, doc_text, passages, target)
        prompt, kind = self._chat_prompt(message, context, doc_text, passages, details, route)
        temperature = 0.1 if route in ("create_document", "modify_document") else 0.3
        return ChatPlan(session_id, kind, prompt, temperature=temperature)

    async def deep_read(self, request: ChatRequest, session_id: str, user_id: str, target: ModelTarget,
                        charge: Charge) -> AsyncIterator[dict]:
        """Deep read (RLM): the whole document, or all the user's documents, explored with code instead of snippets."""
        question = request.content.strip()
        if not question:
            yield {"event": "done", "data": _reply(session_id, "Please provide a message.")}
            return
        await messages.add(session_id, "user", question)
        yield {"event": "meta", "data": {"session_id": session_id, "kind": ANSWER, "mode": "deep"}}
        corpus = await self._corpus(request, user_id)
        if corpus is None:
            yield {"event": "done", "data": await self._save_reply(session_id, NOTHING_TO_READ)}
            return
        async for event in self.reader.read(question, corpus, target, charge):
            if event["event"] != "rlm_done":
                yield event
                continue
            result = event["data"]
            try:
                answer = clean_model_output(result["answer"], strict=True)
            except UnsafeOutput as error:
                answer = f"I could not complete that because it violated a safety rule: {error}"
            if result.get("stopped"):
                answer = f"{answer}\n\n_{result['stopped']}_"
            yield {"event": "done", "data": await self._save_reply(
                session_id, answer, steps=result["steps"], sub_calls=result["sub_calls"], read_mode=result["mode"],
                documents=[name for name, _ in corpus.documents])}

    async def _corpus(self, request: ChatRequest, user_id: str) -> Optional[Corpus]:
        """The text a deep read covers: every recent document for scope "all", otherwise the open one in full."""
        if request.scope == "all":
            ids = await documents.owned_ids(user_id, None, MAX_DOCUMENTS)
            rows, total = [], 0
            for row in await documents.texts(ids, DEEP_DOCUMENT_CHARS):
                text = (row["text"] or "")[:max(0, DEEP_TOTAL_CHARS - total)]
                if text.strip():
                    rows.append((row["filename"], text))
                    total += len(text)
            return Corpus(rows) if rows else None
        name, text = "Your document", ""
        stored = None
        if request.document_id and await documents.owner(request.document_id) == user_id:
            stored = await documents.get(request.document_id)
            name = stored["filename"] if stored else name
        if request.document_content and request.document_content.strip():
            raw = request.document_content
            text = html_to_markdown(raw) if looks_like_html(raw) else raw
        elif stored:
            text = stored["extracted_text"] or ""
        text = text[:DEEP_DOCUMENT_CHARS]
        return Corpus([(name, text)]) if len(text.strip()) > 10 else None

    async def finish(self, plan: ChatPlan, raw: str) -> dict:
        try:
            answer = clean_model_output(raw, strict=plan.strict)
        except UnsafeOutput as error:
            answer = f"I could not complete that because it violated a safety rule: {error}"
        return await self._save_reply(plan.session_id, answer, kind=plan.kind, sources=plan.sources)

    async def _save_reply(self, session_id: str, text: str, kind: str = ANSWER, stored: Optional[str] = None, **extra) -> dict:
        try:
            await messages.add(session_id, "assistant", stored or text)
        except Exception as error:
            logger.warning("Could not store assistant message: %s", error)
        return _reply(session_id, text, kind, **extra)

    async def _plan_workspace_answer(self, session_id: str, user_id: str, message: str) -> ChatPlan:
        found = await self.retriever.search_many(message, user_id)
        if not found:
            return ChatPlan(session_id, ANSWER, reply=await self._save_reply(session_id, NOTHING_FOUND, sources=[]))
        sources = SourceList()
        numbered = sources.add(found)
        prompt = prompts.answer_from_sources(SourceList.prompt_block(numbered), message)
        return ChatPlan(session_id, ANSWER, prompt, temperature=0.2, sources=sources.public())

    async def _summarize(self, session_id: str, history: List[dict], target: ModelTarget) -> dict:
        if len(history) <= 1:
            return _reply(session_id, "I don't have enough conversation history to summarize yet. Let's have a conversation first!")
        if not self.llm.available(target):
            return await self._save_reply(session_id, LLM_UNAVAILABLE)
        result = await self.llm.generate_response(prompts.conversation_summary(_transcript(history[:-1])), target=target)
        summary = _collapse(result.content)
        return await self._save_reply(session_id, f"**Conversation summary**\n\n{summary}", stored=f"{SUMMARY_TAG} {summary}")

    async def _fill_reply(self, session_id: str, filled: str, route: str) -> dict:
        try:
            document = guard_output(filled)
        except UnsafeOutput as error:
            return await self._save_reply(session_id, f"I can't apply those details because of safety rules: {error}", intent=route)
        return await self._save_reply(session_id, document, kind=DOCUMENT,
                                      stored="[PLACEHOLDER-FILL] Placeholders replaced using cached details.", intent=route)

    async def _rolling_summary(self, session_id: str, history: List[dict], target: ModelTarget) -> Optional[str]:
        """Summarize long conversations so the prompt only needs the last few messages."""
        recent = next((m for m in reversed(history[-10:]) if SUMMARY_TAG in m.get("content", "")), None)
        if recent:
            return recent["content"].replace(f"{SUMMARY_TAG} ", "")
        if len(history) <= SUMMARIZE_AFTER or not self.llm.available(target):
            return None
        result = await self.llm.generate_response(prompts.rolling_summary(_transcript(history[:-RECENT_MESSAGES])), target=target)
        summary = _collapse(result.content)
        await messages.add(session_id, "system", f"{SUMMARY_TAG} {summary}")
        return summary

    async def _passages(self, document_id: Optional[str], user_id: str, message: str) -> str:
        """RAG: the parts of the user's stored document most relevant to the message."""
        if not document_id or await documents.owner(document_id) != user_id:
            return ""
        found = await self.retriever.search(message, document_id)
        return truncate("\n\n".join(c.content for c in found), RETRIEVED_CONTEXT_CHARS)

    async def _context(self, session_id: str, history: List[dict], doc_text: str, passages: str,
                       target: ModelTarget) -> str:
        parts = []
        summary = await self._rolling_summary(session_id, history, target)
        if summary:
            parts.append(f"Previous Conversation Summary:\n{summary}")
        parts.append(f"Recent conversation (last 2 exchanges):\n{_transcript(history[-RECENT_MESSAGES:])}")
        if doc_text:
            parts.append(doc_text)
        if passages:
            parts.append(f"Relevant document passages:\n{passages}")
        return "\n".join(parts)

    @staticmethod
    def _toolbar_prompt(message: str, doc_text: str) -> str:
        instruction = re.search(r"Instruction:\s*(.*?)\n", message, re.DOTALL)
        selection = re.search(r"Selected passage:\s*(.*)", message, re.DOTALL)
        return prompts.toolbar_rewrite(
            instruction.group(1).strip() if instruction else "Improve this text",
            selection.group(1).strip() if selection else doc_text,
        )

    @staticmethod
    def _chat_prompt(message: str, context: str, doc_text: str, passages: str, details: dict,
                     route: str) -> Tuple[str, str]:
        if doc_text and details and has_placeholders(doc_text):
            return prompts.fill_placeholders(details, doc_text), DOCUMENT
        if doc_text:
            return prompts.update_document(doc_text, message, passages), DOCUMENT
        creating = route == "create_document" or any(
            word in message.lower() for word in ("write", "create", "draft", "make", "generate", "prepare", "compose")
        )
        if creating:
            return prompts.write_document(context, message), DOCUMENT
        return prompts.assistant_reply(context, message), ANSWER
