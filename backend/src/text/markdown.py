"""Conversions between HTML, Markdown and plain text, plus LLM output cleanup."""
import re

HTML_TO_MD = (
    (r"<strong>(.*?)</strong>", r"**\1**"),
    (r"<b>(.*?)</b>", r"**\1**"),
    (r"<em>(.*?)</em>", r"*\1*"),
    (r"<i>(.*?)</i>", r"*\1*"),
    (r"<h1>(.*?)</h1>", r"# \1\n\n"),
    (r"<h2>(.*?)</h2>", r"## \1\n\n"),
    (r"<h3>(.*?)</h3>", r"### \1\n\n"),
    (r"<h4>(.*?)</h4>", r"#### \1\n\n"),
    (r"<ul>(.*?)</ul>", r"\1\n"),
    (r"<ol>(.*?)</ol>", r"\1\n"),
    (r"<li>(.*?)</li>", r"- \1\n"),
    (r"<p>(.*?)</p>", r"\1\n\n"),
    (r"<br\s*/?>", "\n"),
    (r"<div>(.*?)</div>", r"\1\n"),
)

HTML_TO_TEXT = (
    (r"<li>", "\n* "),
    (r"</li>", ""),
    (r"<h[1-6]>", "\n\n"),
    (r"</h[1-6]>", "\n\n"),
    (r"<p>", ""),
    (r"</p>", "\n\n"),
    (r"<br\s*/?>", "\n"),
    (r"<(strong|b)>(.*?)</\1>", r"**\2**"),
)

HTML_ENTITIES = {"&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"'}

HEADER_KEYWORDS = "Date|To|From|Subject|Title|Prepared by"

TEMPLATE_MARKERS = (
    "FORMATTING TEMPLATE TO MAINTAIN:",
    "FORMATTING GUIDELINES",
    "[Body paragraphs - keep ALL paragraphs",
    "[Keep the closing paragraph]",
    "⚠️ REMINDER:",
    "INSTRUCTION:",
    "TEXT TO REWRITE:",
    "REWRITTEN TEXT:",
)


def looks_like_html(text: str) -> bool:
    return "<" in text and ">" in text


def html_to_markdown(html: str) -> str:
    if not html:
        return ""
    md = html
    for pattern, replacement in HTML_TO_MD:
        md = re.sub(pattern, replacement, md, flags=re.DOTALL)
    md = re.sub(r"<[^>]+>", "", md)
    md = re.sub(r"\n{3,}", "\n\n", md)
    for entity, char in HTML_ENTITIES.items():
        md = md.replace(entity, char)
    return md.strip()


def html_to_text(html: str) -> str:
    text = html
    for pattern, replacement in HTML_TO_TEXT:
        text = re.sub(pattern, replacement, text)
    text = re.sub(r"<[^>]+>", "", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def truncate(text: str, limit: int) -> str:
    return text[:limit] + "..." if len(text) > limit else text


def fix_markdown_formatting(content: str) -> str:
    """Repair the malformed bold/heading syntax small local models tend to produce."""
    if not content:
        return content
    fixed = re.sub(r"\\\\?\*", "*", content)
    fixed = re.sub(r"\\\\?\[", "[", fixed)
    fixed = re.sub(r"\\\\?\]", "]", fixed)
    fixed = re.sub(r"\*{3,}", "**", fixed)
    fixed = re.sub(r"\*\*\s+([^*]+?)\s+\*\*", r"**\1**", fixed)
    fixed = re.sub(rf"\*\*\s+({HEADER_KEYWORDS})", r"**\1", fixed)
    fixed = re.sub(r"(\*\*[^*:]+:\*\*)([A-Za-z0-9])", r"\1 \2", fixed)
    fixed = re.sub(r"(\*\*[^*:]+:)([^\s*])", r"\1 \2", fixed)
    fixed = re.sub(r"(\*\*[^*]+\*\*)(\*\*)", r"\1\n\n\2", fixed)
    fixed = re.sub(rf"([^\n])(\*\*\s*(?:{HEADER_KEYWORDS})\s*:)", r"\1\n\n\2", fixed, flags=re.IGNORECASE)
    fixed = re.sub(r"(:\*\*)([A-Za-z0-9\[])", r":** \2", fixed)
    fixed = re.sub(r"\n{3,}", "\n\n", fixed)
    return "\n".join(line.rstrip() for line in fixed.split("\n")).strip()


def strip_template_markers(response: str) -> str:
    """Drop prompt scaffolding that the model echoed back into its answer."""
    kept, skipping = [], False
    for line in response.split("\n"):
        if any(marker in line for marker in TEMPLATE_MARKERS):
            skipping = True
            continue
        if skipping and line.strip() and not line.startswith(("[", "⚠")):
            skipping = False
        if not skipping:
            kept.append(line)
    return "\n".join(kept).strip()


def strip_preamble(response: str) -> str:
    """Remove a leading "Here is your ...:" line the model adds before the real content."""
    first, _, rest = response.partition("\n")
    if re.match(r"^\s*((sure|certainly|of course|okay|ok)[!,.]?\s*)?(here is|here's)\b.*:\s*$", first, re.IGNORECASE):
        return rest.strip()
    return response


def strip_code_fence(response: str) -> str:
    lines = response.strip().split("\n")
    if lines and lines[0].startswith("```"):
        lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
    return "\n".join(lines).strip()
