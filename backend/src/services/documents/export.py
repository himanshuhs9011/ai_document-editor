"""Convert editor HTML or Markdown into .docx bytes."""
import io
import logging
import os
import re
import tempfile
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from typing import Optional

from docx import Document as DocxDocument

logger = logging.getLogger(__name__)


def export_filename(requested: Optional[str]) -> str:
    stem = re.sub(r"[^A-Za-z0-9._-]", "_", Path(requested or "").stem)
    return f"{stem or f'Document_{int(datetime.now().timestamp())}'}.docx"


class _HtmlToDocx(HTMLParser):
    """Minimal HTML-to-DOCX fallback used when pandoc is not installed."""

    def __init__(self, document):
        super().__init__()
        self.document = document
        self.paragraph = None
        self.list_depth = 0
        self.bold = self.italic = self.underline = False

    def handle_starttag(self, tag, attrs):
        if tag in ("p", "div"):
            self.paragraph = self.document.add_paragraph()
        elif tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            self.paragraph = self.document.add_heading(level=int(tag[1]))
        elif tag == "br" and self.paragraph:
            self.paragraph.add_run().add_break()
        elif tag in ("ul", "ol"):
            self.list_depth += 1
        elif tag == "li":
            self.paragraph = self.document.add_paragraph(style="List Bullet" if self.list_depth else "Normal")
        self._set_style(tag, True)

    def handle_endtag(self, tag):
        if tag in ("ul", "ol"):
            self.list_depth -= 1
        self._set_style(tag, False)

    def _set_style(self, tag, value):
        if tag in ("strong", "b"):
            self.bold = value
        elif tag in ("em", "i"):
            self.italic = value
        elif tag == "u":
            self.underline = value

    def handle_data(self, data):
        if data.strip() and self.paragraph is not None:
            run = self.paragraph.add_run(data.strip() + " ")
            run.bold, run.italic, run.underline = self.bold or None, self.italic or None, self.underline or None


def _markdown_to_docx(content: str, document) -> None:
    for block in (part.strip() for part in content.split("\n\n")):
        heading = re.match(r"^(#{1,3}) (.+)", block)
        if heading:
            document.add_heading(heading.group(2).strip(), level=len(heading.group(1)))
        elif block:
            paragraph = document.add_paragraph()
            lines = [line for line in block.split("\n") if line.strip()]
            for index, line in enumerate(lines):
                paragraph.add_run(line)
                if index < len(lines) - 1:
                    paragraph.add_run().add_break()


SANDBOX_MIN_PANDOC = (2, 19)


def _pandoc_docx(content: str, source_format: str) -> bytes:
    """Convert with pandoc in --sandbox mode: without it, an <img> or ![](...) in the user's content makes pandoc
    embed any server file or internal URL into the DOCX. Older pandoc cannot sandbox, so it is never used."""
    import pypandoc
    version = tuple(int(part) for part in re.findall(r"\d+", pypandoc.get_pandoc_version())[:2])
    if version < SANDBOX_MIN_PANDOC:
        raise RuntimeError("pandoc older than 2.19 cannot run sandboxed")
    handle, path = tempfile.mkstemp(suffix=".docx")
    os.close(handle)
    try:
        pypandoc.convert_text(content, "docx", format=source_format, outputfile=path, extra_args=["--sandbox"])
        return Path(path).read_bytes()
    finally:
        os.remove(path)


def docx_bytes(content: str) -> bytes:
    """Blocking call: run it in a worker thread."""
    is_html = content.strip().startswith("<") and any(tag in content for tag in ("</p>", "</h", "</div>"))
    try:
        return _pandoc_docx(content, "html" if is_html else "md")
    except Exception as error:
        logger.info("pandoc unavailable (%s); using built-in converter", error)
    document = DocxDocument()
    if is_html:
        _HtmlToDocx(document).feed(content)
    else:
        _markdown_to_docx(content, document)
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()
