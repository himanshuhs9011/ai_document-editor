"""OCR for scanned PDFs (needs the Poppler and Tesseract binaries installed)."""
import logging

import pytesseract
from pdf2image import convert_from_bytes

logger = logging.getLogger(__name__)

# Scanned pages beyond this are not read: OCR at 200 dpi costs about 10 MB of memory and seconds of CPU per page.
OCR_PAGE_LIMIT = 30


def ocr_pdf(data: bytes) -> str:
    try:
        images = convert_from_bytes(data, dpi=200, first_page=1, last_page=OCR_PAGE_LIMIT)
        return "\n\n".join(
            f"--- Page {number} ---\n{pytesseract.image_to_string(image)}"
            for number, image in enumerate(images, start=1)
        )
    except Exception as error:
        logger.warning("OCR failed: %s", error)
        return ""
