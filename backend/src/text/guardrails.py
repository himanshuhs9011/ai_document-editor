"""Final checks applied to model output before it reaches the editor."""
from .markdown import looks_like_html
from .placeholders import normalize_placeholders

HTML_BLOCKLIST = ("<script", "<iframe", "<object", "javascript:")


class UnsafeOutput(ValueError):
    pass


def guard_output(content: str) -> str:
    if looks_like_html(content) and any(snippet in content.lower() for snippet in HTML_BLOCKLIST):
        raise UnsafeOutput("Unsafe HTML fragment detected in model output.")
    return normalize_placeholders(content).strip()
