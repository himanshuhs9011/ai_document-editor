"""Regression tests for security fixes. Run from backend/: python -m unittest discover -s tests"""
import base64
import io
import shutil
import tempfile
import unittest
import zipfile
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace

import fitz

from src import deps
from src.services.documents import export
from src.services.documents.parsers import MAX_PDF_PAGES, DocumentTooLarge, parse_document
from src.services.providers import InvalidProviderUrl, ensure_public_https

SECRET = b"DUMMY_SECRET_for_tests"
PIXEL_PNG = base64.b64encode(bytes.fromhex(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082")).decode()


def docx_parts(data: bytes) -> dict:
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        return {name: archive.read(name) for name in archive.namelist()}


@unittest.skipUnless(shutil.which("pandoc"), "pandoc is not installed; the built-in converter never reads files")
class ExportCannotReadServerFiles(unittest.TestCase):
    """Exported content must never make pandoc embed a server file or an internal URL."""

    def setUp(self):
        self.folder = Path(tempfile.mkdtemp())
        (self.folder / "secret.env").write_bytes(SECRET)
        (self.folder / "secret.png").write_bytes(SECRET)

    def tearDown(self):
        shutil.rmtree(self.folder)

    def assert_not_leaked(self, content: str):
        leaked = [name for name, body in docx_parts(export.docx_bytes(content)).items() if SECRET in body]
        self.assertEqual(leaked, [], f"server file embedded via {content!r}")

    def test_html_image_paths(self):
        path = self.folder.as_posix()
        for src in (f"file:///{path}/secret.png", f"{path}/secret.png", f"{path}/secret.env"):
            self.assert_not_leaked(f'<p>x</p><img src="{src}">')

    def test_markdown_image(self):
        self.assert_not_leaked(f"x\n\n![x]({self.folder.as_posix()}/secret.png)")

    def test_inline_images_still_embedded(self):
        parts = docx_parts(export.docx_bytes(f'<p>x</p><img src="data:image/png;base64,{PIXEL_PNG}">'))
        self.assertTrue(any(name.startswith("word/media/") for name in parts))


class UploadsCannotExhaustMemory(unittest.TestCase):
    def test_pdf_page_cap(self):
        pdf = fitz.open()
        for _ in range(MAX_PDF_PAGES + 1):
            pdf.new_page()
        with self.assertRaises(DocumentTooLarge):
            parse_document(pdf.tobytes(deflate=True), "pdf")

    def test_docx_zip_bomb(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("word/document.xml", b" " * (201 * 1024 * 1024))
        with self.assertRaises(DocumentTooLarge):
            parse_document(buffer.getvalue(), "docx")


class CustomProviderUrls(unittest.IsolatedAsyncioTestCase):
    async def test_requires_https(self):
        with self.assertRaises(InvalidProviderUrl):
            await ensure_public_https("http://api.example.com/v1")

    async def test_rejects_private_addresses(self):
        for url in ("https://localhost/v1", "https://127.0.0.1/v1", "https://169.254.169.254/v1", "https://10.0.0.5/v1"):
            with self.assertRaises(InvalidProviderUrl, msg=url):
                await ensure_public_https(url)


class ClientAddressForRateLimits(unittest.TestCase):
    def ip(self, hops: int, forwarded=None) -> str:
        original = deps.settings
        deps.settings = replace(original, trusted_proxy_hops=hops)
        try:
            headers = {"x-forwarded-for": forwarded} if forwarded else {}
            return deps.client_ip(SimpleNamespace(headers=headers, client=SimpleNamespace(host="10.0.0.1")))
        finally:
            deps.settings = original

    def test_header_ignored_without_trusted_proxy(self):
        self.assertEqual(self.ip(0, "6.6.6.6"), "10.0.0.1")

    def test_forged_entries_ignored_behind_one_proxy(self):
        self.assertEqual(self.ip(1, "6.6.6.6, 203.0.113.7"), "203.0.113.7")


if __name__ == "__main__":
    unittest.main()
