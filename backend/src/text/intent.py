"""Keyword-based routing of user messages to the right kind of response."""
import re

TOOLBAR_MARKER = "you are assisting inside a rich text editor"

CREATE_KEYWORDS = (
    "application", "write", "draft", "create", "prepare", "compose",
    "report", "request", "letter", "notice", "resume", "cv",
)
EDIT_KEYWORDS = (
    "update", "change", "modify", "edit", "add", "replace", "remove", "rewrite",
    "improve", "expand", "concise", "shorten", "lengthen",
)
DETAIL_KEYWORDS = ("name", "email", "manager", "phone", "contact", "title", "company", "region")
QUESTION_WORDS = ("what", "what's", "why", "how", "when", "where", "who", "which", "whose", "does", "do", "is", "are",
                  "can", "could", "should", "would", "will", "explain", "list", "find", "summarize", "summarise")
CHANGE_VERBS = EDIT_KEYWORDS + ("make", "fix", "translate", "convert", "format", "correct", "write", "draft", "turn", "put", "insert")
SUMMARY_KEYWORDS = ("summarize", "summary", "summarise", "chat history", "conversation summary")
CLEAR_SUMMARY_KEYWORDS = ("clear summary", "forget summary", "reset summary", "new summary")

SMALL_TALK = (
    "hi", "hello", "hey", "thanks", "thank you", "ok", "okay", "good", "great", "nice", "cool",
    "what's up", "how are you", "test", "testing", "check", "looks good", "perfect", "awesome",
)
GREETINGS = ("hi", "hello", "hey")
THANKS = ("thanks", "thank you")
TESTS = ("test", "testing", "check")


def _has_phrase(text: str, phrases) -> bool:
    return any(re.search(rf"\b{re.escape(phrase)}\b", text) for phrase in phrases)


def is_small_talk(message: str) -> bool:
    """True for short greetings/acknowledgements that need no model call."""
    text = message.lower().strip()
    return len(text) < 25 and _has_phrase(text, SMALL_TALK)


def small_talk_reply(message: str) -> str:
    text = message.lower().strip()
    if _has_phrase(text, THANKS):
        return "You're welcome! Is there anything else I can help you with?"
    if _has_phrase(text, GREETINGS):
        return "Hello! I'm your AI document assistant. How can I help you today?"
    if _has_phrase(text, TESTS):
        return "I'm working perfectly! Ready to help you with document editing and creation."
    if _has_phrase(text, ("good", "great", "nice", "perfect", "looks good", "awesome")):
        return "Great! I'm glad you're happy with the result. Let me know if you need any other changes."
    return "I'm here to help with your documents. What would you like me to do?"


def wants_summary(text: str) -> bool:
    return any(keyword in text for keyword in SUMMARY_KEYWORDS)


def wants_clear_summary(text: str) -> bool:
    return any(keyword in text for keyword in CLEAR_SUMMARY_KEYWORDS)


def wants_answer(text: str) -> bool:
    """True when the user asks about the document rather than asking to change it."""
    words = text.split()
    asks = text.rstrip().endswith("?") or bool(words and words[0] in QUESTION_WORDS) or text.startswith("tell me")
    return asks and not _has_phrase(text, CHANGE_VERBS)


def detect_intent(text: str, has_document: bool, has_details: bool, has_placeholders: bool) -> str:
    if has_placeholders and has_document and has_details:
        return "fill_placeholders"
    if not has_document and any(keyword in text for keyword in CREATE_KEYWORDS):
        return "create_document"
    if has_document and any(keyword in text for keyword in EDIT_KEYWORDS):
        return "modify_document"
    if has_details and any(keyword in text for keyword in DETAIL_KEYWORDS):
        return "collect_details"
    return "chat"
