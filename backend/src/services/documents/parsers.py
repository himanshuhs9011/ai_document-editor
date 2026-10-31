"""Extract text (and HTML for DOCX) from uploaded PDF, DOCX and TXT bytes."""
import base64
import io
import zipfile
from dataclasses import dataclass, field
from typing import List, Optional

import fitz
import mammoth
from docx import Document as DocxDocument

from .ocr import ocr_pdf

SUPPORTED_TYPES = ("pdf", "docx", "txt")

# Below this many characters a PDF is treated as scanned and sent to OCR.
MIN_TEXT_LAYER_CHARS = 20

# Limits that keep one upload from exhausting the server's memory (blank-page PDFs, zip-bomb DOCX files).
MAX_PDF_PAGES = 500
MAX_DOCX_UNPACKED_BYTES = 200 * 1024 * 1024


class DocumentTooLarge(ValueError):
    pass

DOCX_STYLE_MAP = """
p[style-name='Heading 1'] => h1:fresh
p[style-name='Heading 2'] => h2:fresh
p[style-name='Heading 3'] => h3:fresh
p[style-name='Heading 4'] => h4:fresh
p[style-name='Heading 5'] => h5:fresh
p[style-name='Heading 6'] => h6:fresh
r[style-name='Strong'] => strong
r[style-name='Emphasis'] => em
br[type=page] => hr.page-break:fresh
p[style-name='Page Break'] => hr.page-break:fresh
""".strip()


@dataclass
class ParsedDocument:
    text: str
    pages: List[str] = field(default_factory=list)
    html: Optional[str] = None

    @property
    def page_count(self) -> int:
        return max(len(self.pages), 1)


def _parse_pdf(data: bytes) -> ParsedDocument:
    with fitz.open(stream=data, filetype="pdf") as pdf:
        if pdf.page_count > MAX_PDF_PAGES:
            raise DocumentTooLarge(f"PDFs can have at most {MAX_PDF_PAGES} pages")
        pages = [page.get_text() for page in pdf]
    text = "\n\n".join(pages).strip()
    if len(text) < MIN_TEXT_LAYER_CHARS:
        text = ocr_pdf(data) or text
    return ParsedDocument(text=text, pages=pages)


def _inline_image(image) -> dict:
    with image.open() as stream:
        encoded = base64.b64encode(stream.read()).decode()
    return {"src": f"data:{image.content_type or 'image/png'};base64,{encoded}"}


def _check_unpacked_size(data: bytes) -> None:
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        if sum(entry.file_size for entry in archive.infolist()) > MAX_DOCX_UNPACKED_BYTES:
            raise DocumentTooLarge("This Word file unpacks to more than 200 MB")


def _parse_docx(data: bytes) -> ParsedDocument:
    _check_unpacked_size(data)
    html = mammoth.convert_to_html(
        io.BytesIO(data), convert_image=mammoth.images.inline(_inline_image), style_map=DOCX_STYLE_MAP
    ).value
    text = "\n".join(paragraph.text for paragraph in DocxDocument(io.BytesIO(data)).paragraphs)
    return ParsedDocument(text=text, pages=[text], html=html)


def _parse_txt(data: bytes) -> ParsedDocument:
    text = data.decode("utf-8", errors="replace")
    return ParsedDocument(text=text, pages=[text])


PARSERS = {"pdf": _parse_pdf, "docx": _parse_docx, "txt": _parse_txt}


def parse_document(data: bytes, file_type: str) -> ParsedDocument:
    """Blocking call: run it in a worker thread."""
    return PARSERS[file_type](data)
