import os
import json
import uuid
import base64
import fitz  # PyMuPDF
from pdf2image import convert_from_path
import pytesseract
# from paddleocr import PaddleOCR  # Commented out due to build issues on Windows
from PIL import Image
import asyncio
from typing import List, Dict, Any, Optional
import logging
from datetime import datetime
from pathlib import Path
import aiosqlite
from docx import Document as DocxDocument
from docx.shared import Inches
import mammoth

from ..models.schemas import DocumentResponse, DocumentPage, OCRResult, ChatMessage

logger = logging.getLogger(__name__)

class DocumentService:
    """Service for document processing, OCR, and storage management"""
    
    def __init__(self, 
                 storage_path: str = "data",
                 db_path: str = "data/sessions.db"):
        self.storage_path = storage_path
        self.db_path = db_path
        self.ocr_engine = None
        self.paddle_ocr = None
        self.documents_cache = {}
        
        # Create necessary directories
        os.makedirs(f"{storage_path}/uploads", exist_ok=True)
        os.makedirs(f"{storage_path}/exports", exist_ok=True)
        os.makedirs(f"{storage_path}/sessions", exist_ok=True)
        
    async def initialize(self):
        """Initialize OCR engines and database"""
        print("🔧 DocumentService: Starting initialization...")
        try:
            # Ensure data directory exists
            os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
            
            # Initialize PaddleOCR (commented out due to build issues)
            # self.paddle_ocr = PaddleOCR(use_angle_cls=True, lang='en')
            self.paddle_ocr = None  # Temporarily disabled
            print("🔧 DocumentService: OCR setup complete")
            
            # Initialize database
            print("🔧 DocumentService: Initializing database...")
            await self._init_database()
            print("✅ DocumentService: Database initialized")
            
            # 🔥 NEW: Restore cache from database
            print("🔧 DocumentService: Restoring cache...")
            await self._restore_recent_documents()
            print("✅ DocumentService: Cache restoration completed")
            
            logger.info("✅ Document service initialized with cache restoration")
            return True
            
        except Exception as e:
            print(f"❌ DocumentService initialization error: {e}")
            logger.error(f"❌ Failed to initialize document service: {e}")
            # Don't fail completely, allow app to start even if DB has issues
            return True
    
    async def _init_database(self):
        """Initialize SQLite database for session storage"""
        print(f"🗄️  Initializing database at: {self.db_path}")
        try:
            # Ensure directory exists again just in case
            os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
            
            async with aiosqlite.connect(self.db_path) as db:
                print("🔗 Database connection established")
                
                print("📋 Creating sessions table...")
                await db.execute("""
                    CREATE TABLE IF NOT EXISTS sessions (
                        id TEXT PRIMARY KEY,
                        name TEXT,
                        user_id TEXT,
                        document_id TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        metadata TEXT
                    )
                """)
                print("✅ Sessions table created")
                
                print("📋 Creating messages table...")
                await db.execute("""
                    CREATE TABLE IF NOT EXISTS messages (
                        id TEXT PRIMARY KEY,
                        session_id TEXT,
                        role TEXT,
                        content TEXT,
                        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        metadata TEXT,
                        FOREIGN KEY (session_id) REFERENCES sessions (id)
                    )
                """)
                print("✅ Messages table created")
                
                print("📋 Creating documents table...")
                await db.execute("""
                    CREATE TABLE IF NOT EXISTS documents (
                        id TEXT PRIMARY KEY,
                        filename TEXT,
                        file_type TEXT,
                        page_count INTEGER,
                        extracted_text TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        metadata TEXT
                    )
                """)
                print("✅ Documents table created")
                
                print("💾 Committing changes...")
                await db.commit()
                print("✅ Database initialization completed successfully")
                
        except Exception as e:
            print(f"❌ Database initialization error: {e}")
            raise e
    
    async def _restore_recent_documents(self):
        """Restore recent documents to cache from database"""
        try:
            # Check if database exists before trying to connect
            if not os.path.exists(self.db_path):
                print("ℹ️ Database file not found, skipping cache restoration")
                return

            async with aiosqlite.connect(self.db_path) as db:
                # Check if documents table exists
                cursor = await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='documents'")
                if not await cursor.fetchone():
                    print("ℹ️ Documents table not found, skipping cache restoration")
                    return

                cursor = await db.execute("""
                    SELECT id, filename, file_type, metadata
                    FROM documents
                    ORDER BY created_at DESC
                    LIMIT 10  -- Only restore 10 most recent documents
                """)
                
                rows = await cursor.fetchall()
                
                restored_count = 0
                total_documents = 0
                
                for row in rows:
                    total_documents += 1
                    document_id = row[0]
                    filename = row[1]
                    file_type = row[2]
                    metadata = json.loads(row[3]) if row[3] else {}
                    
                    # Get original file path
                    original_path = metadata.get("original_path")
                    if original_path and os.path.exists(original_path):
                        try:
                            # Restore document to cache based on file type
                            if file_type == 'pdf':
                                doc_data = await self._process_pdf(original_path, document_id)
                            elif file_type in ['docx', 'doc']:
                                doc_data = await self._process_docx(original_path, document_id)
                            elif file_type == 'txt':
                                doc_data = await self._process_txt(original_path, document_id)
                            else:
                                continue
                            
                            self.documents_cache[document_id] = doc_data
                            restored_count += 1
                            logger.info(f"✅ Restored document {document_id} ({filename}) to cache")
                            
                        except Exception as e:
                            logger.warning(f"⚠️ Could not restore document {document_id}: {e}")
                    else:
                        logger.warning(f"⚠️ Document file not found: {original_path}")
                
                logger.info(f"🔄 Cache restoration complete: {restored_count}/{total_documents} documents restored")
                
        except Exception as e:
            logger.error(f"❌ Error restoring cache: {e}")

    async def _restore_single_document_if_needed(self, document_id: str) -> bool:
        """Restore a single document to cache if not present"""
        if document_id in self.documents_cache:
            return True  # Already in cache
        
        try:
            async with aiosqlite.connect(self.db_path) as db:
                cursor = await db.execute("""
                    SELECT filename, file_type, metadata
                    FROM documents
                    WHERE id = ?
                """, (document_id,))
                
                row = await cursor.fetchone()
                if row:
                    filename = row[0]
                    file_type = row[1]
                    metadata = json.loads(row[2]) if row[2] else {}
                    
                    original_path = metadata.get("original_path")
                    if original_path and os.path.exists(original_path):
                        # Restore document to cache based on file type
                        if file_type == 'pdf':
                            doc_data = await self._process_pdf(original_path, document_id)
                        elif file_type in ['docx', 'doc']:
                            doc_data = await self._process_docx(original_path, document_id)
                        elif file_type == 'txt':
                            doc_data = await self._process_txt(original_path, document_id)
                        else:
                            return False
                        
                        self.documents_cache[document_id] = doc_data
                        logger.info(f"✅ Restored document {document_id} ({filename}) to cache on-demand")
                        return True
                    else:
                        logger.error(f"❌ Document file not found: {original_path}")
                        return False
                else:
                    logger.error(f"❌ Document {document_id} not found in database")
                    return False
            
        except Exception as e:
            logger.error(f"❌ Error restoring document {document_id}: {e}")
            return False

    async def process_document(self, file_path: str) -> Dict[str, Any]:
        """Process uploaded document and extract metadata"""
        try:
            document_id = str(uuid.uuid4())
            filename = os.path.basename(file_path)
            file_type = filename.split('.')[-1].lower()
            
            if file_type == 'pdf':
                doc_data = await self._process_pdf(file_path, document_id)
            elif file_type in ['docx', 'doc']:
                doc_data = await self._process_docx(file_path, document_id)
            elif file_type == 'txt':
                doc_data = await self._process_txt(file_path, document_id)
            else:
                raise ValueError(f"Unsupported file type: {file_type}")
            
            html_content = doc_data.get("metadata", {}).get("html_content")
            if html_content:
                doc_data["html_content"] = html_content

            # Store document metadata in database
            await self._store_document_metadata(document_id, filename, file_type, doc_data)
            
            # Cache document data
            self.documents_cache[document_id] = doc_data
            
            fallback_text = ""
            if doc_data.get("pages"):
                first_page = doc_data["pages"][0]
                if isinstance(first_page, dict):
                    fallback_text = first_page.get("text_content", "")

            return {
                "document_id": document_id,
                "filename": filename,
                "file_type": file_type,
                "page_count": doc_data["page_count"],
                "pages": doc_data["pages"],
                "metadata": doc_data.get("metadata", {}),
                "html_content": html_content,
                "content": html_content or fallback_text
            }
            
        except Exception as e:
            logger.error(f"❌ Error processing document: {e}")
            raise e
    
    async def _process_pdf(self, file_path: str, document_id: str) -> Dict[str, Any]:
        """Process PDF document"""
        try:
            doc = fitz.open(file_path)
            pages = []
            
            for page_num in range(doc.page_count):
                page = doc[page_num]
                
                # Extract text
                text_content = page.get_text()  # type: ignore[attr-defined]
                
                # Convert page to image for OCR if needed
                pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))  # type: ignore[attr-defined]
                img_data = pix.tobytes("png")
                
                # Get page dimensions
                rect = page.rect
                dimensions = {"width": rect.width, "height": rect.height}
                
                page_data = DocumentPage(
                    page_number=page_num + 1,
                    text_content=text_content,
                    images=[],  # Will be populated with OCR images if needed
                    annotations=[],
                    dimensions=dimensions
                )
                
                pages.append(page_data.dict())
            
            doc.close()
            
            return {
                "page_count": len(pages),
                "pages": pages,
                "metadata": {"original_path": file_path}
            }
            
        except Exception as e:
            logger.error(f"❌ Error processing PDF: {e}")
            raise e
    
    async def _process_docx(self, file_path: str, document_id: str) -> Dict[str, Any]:
        """Process DOCX document and convert to HTML"""
        try:
            # Convert DOCX to HTML using mammoth with inline images and heading preservation
            style_map = """
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

            def _inline_image(image: Any) -> Dict[str, str]:
                try:
                    content_type = getattr(image, "content_type", None) or "image/png"
                except Exception:
                    content_type = "image/png"

                with image.open() as image_bytes:
                    encoded = base64.b64encode(image_bytes.read()).decode("utf-8")

                return {
                    "src": f"data:{content_type};base64,{encoded}"
                }

            with open(file_path, "rb") as docx_file:
                result = mammoth.convert_to_html(
                    docx_file,
                    convert_image=mammoth.images.inline(_inline_image),
                    style_map=style_map
                )
                html_content = result.value  # The generated HTML with inline images
                messages = result.messages  # Any messages (warnings, etc.)
            
            # Also extract plain text for backwards compatibility
            doc = DocxDocument(file_path)
            text_content = []
            for paragraph in doc.paragraphs:
                text_content.append(paragraph.text)
            
            plain_text = "\n".join(text_content)

            image_count = html_content.count("<img") if html_content else 0
            
            # For DOCX, treat as single page with HTML content
            page_data = DocumentPage(
                page_number=1,
                text_content=plain_text,  # Plain text fallback
                images=[],
                annotations=[],
                dimensions={"width": 8.5 * 72, "height": 11 * 72},  # Letter size in points
                html_content=html_content
            )
            
            metadata = {
                "original_path": file_path,
                "html_content": html_content,  # Store HTML version
                "conversion_messages": [str(msg) for msg in messages],
                "image_count": image_count,
                "plain_text": plain_text,
                "plain_text_preview": plain_text[:2000]
            }

            return {
                "page_count": 1,
                "pages": [page_data.dict()],
                "metadata": metadata,
                "html_content": html_content,
                "content": html_content
            }
            
        except Exception as e:
            logger.error(f"❌ Error processing DOCX: {e}")
            raise e
    
    async def _process_txt(self, file_path: str, document_id: str) -> Dict[str, Any]:
        """Process TXT document"""
        try:
            # Read text file content
            with open(file_path, 'r', encoding='utf-8') as file:
                text_content = file.read()
            
            # For TXT, treat as single page
            page_data = DocumentPage(
                page_number=1,
                text_content=text_content,
                images=[],
                annotations=[],
                dimensions={"width": 8.5 * 72, "height": 11 * 72}  # Letter size in points
            )
            
            return {
                "page_count": 1,
                "pages": [page_data.dict()],
                "metadata": {"original_path": file_path}
            }
            
        except Exception as e:
            logger.error(f"❌ Error processing TXT: {e}")
            raise e
    
    async def extract_text_with_ocr(self, file_path: str) -> str:
        """Extract text using OCR for images and improve text extraction"""
        try:
            file_type = file_path.split('.')[-1].lower()
            
            if file_type == 'pdf':
                return await self._ocr_pdf(file_path)
            elif file_type == 'txt':
                # For TXT files, read and return the content
                with open(file_path, 'r', encoding='utf-8') as file:
                    return file.read()
            else:
                # For non-PDF files, return the already extracted text
                return ""
                
        except Exception as e:
            logger.error(f"❌ Error in OCR extraction: {e}")
            return ""
    
    async def _ocr_pdf(self, file_path: str) -> str:
        """Perform OCR on PDF pages"""
        try:
            # Convert PDF to images
            images = convert_from_path(file_path, dpi=200)
            
            all_text = []
            
            for i, image in enumerate(images):
                # Use PaddleOCR for better accuracy
                if self.paddle_ocr:
                    # Convert PIL image to numpy array
                    import numpy as np
                    img_array = np.array(image)
                    
                    # Perform OCR
                    result = self.paddle_ocr.ocr(img_array, cls=True)
                    
                    page_text = []
                    if result:
                        detections = result[0] if result[0] is not None else []
                        for line in detections:
                            try:
                                if (isinstance(line, (list, tuple)) and 
                                    len(line) >= 2 and 
                                    isinstance(line[1], (list, tuple)) and 
                                    len(line[1]) > 0):
                                    
                                    text = str(line[1][0]).strip()
                                    if text:
                                        page_text.append(text)
                            except Exception:
                                # Skip any problematic detections
                                continue
                                    
                    all_text.append(f"--- Page {i+1} ---\n" + "\n".join(page_text))
                
                else:
                    # Fallback to Tesseract
                    text = pytesseract.image_to_string(image)
                    all_text.append(f"--- Page {i+1} ---\n{text}")
            
            return "\n\n".join(all_text)
            
        except Exception as e:
            logger.error(f"❌ Error in PDF OCR: {e}")
            return ""
    
    async def apply_edits(self, document_id: str, changes: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Apply edits to a document"""
        try:
            # Check if document is in cache, if not try to restore it
            if document_id not in self.documents_cache:
                logger.info(f"🔄 Document {document_id} not in cache, attempting to restore...")
                restored = await self._restore_single_document_if_needed(document_id)
                if not restored:
                    raise ValueError(f"Document {document_id} not found and could not be restored")
            
            doc_data = self.documents_cache[document_id].copy()
            
            # Apply changes to document pages
            for change in changes:
                page_num = change.get("page_number", 1) - 1
                if 0 <= page_num < len(doc_data["pages"]):
                    page = doc_data["pages"][page_num]
                    
                    if change["type"] == "replace":
                        # Replace text in the page
                        original = change.get("original_text", "")
                        new_text = change.get("new_text", "")
                        page["text_content"] = page["text_content"].replace(original, new_text)
                    
                    elif change["type"] == "insert":
                        # Insert text at position
                        position = change.get("position", len(page["text_content"]))
                        new_text = change.get("new_text", "")
                        content = page["text_content"]
                        page["text_content"] = content[:position] + new_text + content[position:]
                    
                    elif change["type"] == "delete":
                        # Delete text
                        original = change.get("original_text", "")
                        page["text_content"] = page["text_content"].replace(original, "")
            
            # Update cache
            self.documents_cache[document_id] = doc_data
            
            return doc_data
            
        except Exception as e:
            logger.error(f"❌ Error applying edits: {e}")
            raise e
    
    async def export_document(self, document_id: str, format: str, filename: Optional[str] = None) -> str:
        """Export document in specified format"""
        try:
            # Check if document is in cache, if not try to restore it
            if document_id not in self.documents_cache:
                logger.info(f"🔄 Document {document_id} not in cache, attempting to restore for export...")
                restored = await self._restore_single_document_if_needed(document_id)
                if not restored:
                    raise ValueError(f"Document {document_id} not found and could not be restored")
            
            doc_data = self.documents_cache[document_id]
            
            if not filename:
                filename = f"document_{document_id}.{format}"
            
            export_path = os.path.join(self.storage_path, "exports", filename)
            
            if format.lower() == "pdf":
                await self._export_to_pdf(doc_data, export_path)
            elif format.lower() == "docx":
                await self._export_to_docx(doc_data, export_path)
            else:
                raise ValueError(f"Unsupported export format: {format}")
            
            return export_path
            
        except Exception as e:
            logger.error(f"❌ Error exporting document: {e}")
            raise e
    
    async def _export_to_pdf(self, doc_data: Dict[str, Any], export_path: str):
        """Export document to PDF format"""
        try:
            import reportlab.pdfgen.canvas as canvas
            from reportlab.lib.pagesizes import letter
            
            c = canvas.Canvas(export_path, pagesize=letter)
            width, height = letter
            
            for page in doc_data["pages"]:
                # Add text content to PDF
                text_object = c.beginText(40, height - 40)
                text_object.setFont("Helvetica", 12)
                
                lines = page["text_content"].split('\n')
                for line in lines:
                    text_object.textLine(line)
                
                c.drawText(text_object)
                c.showPage()
            
            c.save()
            
        except Exception as e:
            logger.error(f"❌ Error exporting to PDF: {e}")
            raise e
    
    async def _export_to_docx(self, doc_data: Dict[str, Any], export_path: str):
        """Export document to DOCX format"""
        try:
            doc = DocxDocument()
            
            for page in doc_data["pages"]:
                # Add page content
                lines = page["text_content"].split('\n')
                for line in lines:
                    if line.strip():
                        doc.add_paragraph(line)
                
                # Add page break if not last page
                if page != doc_data["pages"][-1]:
                    doc.add_page_break()
            
            doc.save(export_path)
            
        except Exception as e:
            logger.error(f"❌ Error exporting to DOCX: {e}")
            raise e

    async def export_text_to_docx(self, content: str, export_path: str):
        """Export HTML/markdown/text content to DOCX using pypandoc if available, else simple conversion"""
        try:
            # Ensure parent directory exists
            parent_dir = os.path.dirname(export_path)
            if parent_dir:
                os.makedirs(parent_dir, exist_ok=True)
            
            # Detect if content is HTML
            is_html = content.strip().startswith('<') and ('</p>' in content or '</h' in content or '</div>' in content)
            
            # Try pypandoc first (supports HTML, Markdown, and plain text)
            try:
                import pypandoc
                
                if is_html:
                    # Convert HTML to DOCX
                    pypandoc.convert_text(content, 'docx', format='html', outputfile=export_path)
                    logger.info(f"✅ Exported HTML content to DOCX using pypandoc: {export_path}")
                else:
                    # Convert Markdown to DOCX
                    pypandoc.convert_text(content, 'docx', format='md', outputfile=export_path)
                    logger.info(f"✅ Exported Markdown content to DOCX using pypandoc: {export_path}")
                return
            except ImportError:
                logger.warning("⚠️ pypandoc not available, using fallback conversion")
            except Exception as e:
                logger.warning(f"⚠️ pypandoc conversion failed: {e}, using fallback")
            
            # Fallback: use python-docx with HTML parsing if needed
            doc = DocxDocument()
            
            if is_html:
                # Simple HTML to DOCX conversion
                from html.parser import HTMLParser
                from docx.shared import Pt, RGBColor
                from docx.enum.text import WD_ALIGN_PARAGRAPH
                
                class SimpleHTMLToDocx(HTMLParser):
                    def __init__(self, document):
                        super().__init__()
                        self.doc = document
                        self.current_paragraph = None
                        self.current_run = None
                        self.list_level = 0
                        self.in_bold = False
                        self.in_italic = False
                        self.in_underline = False
                        
                    def handle_starttag(self, tag, attrs):
                        if tag in ['p', 'div']:
                            self.current_paragraph = self.doc.add_paragraph()
                        elif tag in ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']:
                            level = int(tag[1])
                            self.current_paragraph = self.doc.add_heading(level=level)
                        elif tag == 'br':
                            if self.current_paragraph:
                                self.current_paragraph.add_run().add_break()
                        elif tag in ['ul', 'ol']:
                            self.list_level += 1
                        elif tag == 'li':
                            self.current_paragraph = self.doc.add_paragraph(style='List Bullet' if self.list_level else 'Normal')
                        elif tag == 'strong' or tag == 'b':
                            self.in_bold = True
                        elif tag == 'em' or tag == 'i':
                            self.in_italic = True
                        elif tag == 'u':
                            self.in_underline = True
                            
                    def handle_endtag(self, tag):
                        if tag in ['ul', 'ol']:
                            self.list_level -= 1
                        elif tag == 'strong' or tag == 'b':
                            self.in_bold = False
                        elif tag == 'em' or tag == 'i':
                            self.in_italic = False
                        elif tag == 'u':
                            self.in_underline = False
                            
                    def handle_data(self, data):
                        text = data.strip()
                        if text and self.current_paragraph is not None:
                            run = self.current_paragraph.add_run(text + ' ')
                            if self.in_bold:
                                run.bold = True
                            if self.in_italic:
                                run.italic = True
                            if self.in_underline:
                                run.underline = True
                
                parser = SimpleHTMLToDocx(doc)
                parser.feed(content)
                logger.info(f"✅ Exported HTML content to DOCX using fallback parser: {export_path}")
            else:
                # Simple text/markdown conversion
                paragraphs = [p.strip() for p in content.split('\n\n') if p.strip()]
                for p in paragraphs:
                    # Check for markdown headings
                    if p.startswith('# '):
                        doc.add_heading(p[2:].strip(), level=1)
                    elif p.startswith('## '):
                        doc.add_heading(p[3:].strip(), level=2)
                    elif p.startswith('### '):
                        doc.add_heading(p[4:].strip(), level=3)
                    else:
                        # Preserve line breaks within paragraph
                        lines = p.split('\n')
                        para = doc.add_paragraph()
                        for i, line in enumerate(lines):
                            if line.strip():
                                para.add_run(line)
                                if i < len(lines) - 1:
                                    para.add_run().add_break()
                logger.info(f"✅ Exported text content to DOCX using fallback: {export_path}")
            
            doc.save(export_path)

        except Exception as e:
            logger.error(f"❌ Error exporting text to DOCX: {e}")
            raise e
    
    async def _store_document_metadata(self, document_id: str, filename: str, file_type: str, doc_data: Dict[str, Any]):
        """Store document metadata in database"""
        try:
            async with aiosqlite.connect(self.db_path) as db:
                await db.execute("""
                    INSERT INTO documents (id, filename, file_type, page_count, metadata)
                    VALUES (?, ?, ?, ?, ?)
                """, (
                    document_id,
                    filename,
                    file_type,
                    doc_data["page_count"],
                    json.dumps(doc_data.get("metadata", {}))
                ))
                await db.commit()
                
        except Exception as e:
            logger.error(f"❌ Error storing document metadata: {e}")

    async def update_document_text_content(self, document_id: str, extracted_text: str):
        """Persist extracted plain text for a processed document"""
        try:
            async with aiosqlite.connect(self.db_path) as db:
                await db.execute(
                    """
                    UPDATE documents
                    SET extracted_text = ?
                    WHERE id = ?
                    """,
                    (extracted_text, document_id)
                )
                await db.commit()
        except Exception as e:
            logger.error(f"❌ Error updating extracted text for {document_id}: {e}")

    async def attach_document_to_session(self, session_id: str, document_id: str):
        """Link a processed document to an existing session"""
        try:
            now_iso = datetime.now().isoformat()
            async with aiosqlite.connect(self.db_path) as db:
                await db.execute(
                    """
                    UPDATE sessions
                    SET document_id = ?, updated_at = ?, last_accessed = ?
                    WHERE id = ?
                    """,
                    (document_id, now_iso, now_iso, session_id)
                )
                await db.commit()
        except Exception as e:
            logger.error(f"❌ Error attaching document {document_id} to session {session_id}: {e}")

    async def get_session_by_id(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Fetch a single session record"""
        try:
            async with aiosqlite.connect(self.db_path) as db:
                cursor = await db.execute(
                    """
                    SELECT id, name, document_id, created_at, updated_at, last_accessed, metadata
                    FROM sessions
                    WHERE id = ?
                    """,
                    (session_id,)
                )
                row = await cursor.fetchone()

            if not row:
                return None

            return {
                "id": row[0],
                "name": row[1],
                "document_id": row[2],
                "created_at": row[3],
                "updated_at": row[4],
                "last_accessed": row[5],
                "metadata": json.loads(row[6]) if row[6] else {}
            }
        except Exception as e:
            logger.error(f"❌ Error fetching session {session_id}: {e}")
            return None

    async def get_document_by_id(self, document_id: str) -> Optional[Dict[str, Any]]:
        """Return persisted document data, including cached pages and HTML content"""
        try:
            async with aiosqlite.connect(self.db_path) as db:
                cursor = await db.execute(
                    """
                    SELECT filename, file_type, page_count, extracted_text, created_at, metadata
                    FROM documents
                    WHERE id = ?
                    """,
                    (document_id,)
                )
                row = await cursor.fetchone()

            if not row:
                return None

            metadata = json.loads(row[5]) if row[5] else {}

            if document_id not in self.documents_cache:
                await self._restore_single_document_if_needed(document_id)

            cached_doc = self.documents_cache.get(document_id)
            pages = cached_doc.get("pages", []) if cached_doc else []
            page_count = row[2] if row[2] is not None else (cached_doc.get("page_count") if cached_doc else 0)

            html_content = metadata.get("html_content")
            plain_text = metadata.get("plain_text") if metadata else None
            if cached_doc and not cached_doc.get("html_content") and html_content:
                cached_doc["html_content"] = html_content

            if cached_doc and not html_content:
                html_content = cached_doc.get("html_content")

            document = {
                "document_id": document_id,
                "filename": row[0],
                "file_type": row[1],
                "page_count": page_count,
                "extracted_text": row[3],
                "html_content": html_content,
                "content": html_content or plain_text or row[3] or "",
                "pages": pages,
                "metadata": metadata,
                "created_at": row[4] or datetime.now().isoformat()
            }

            return document
        except Exception as e:
            logger.error(f"❌ Error fetching document {document_id}: {e}")
            return None
    
    async def get_session_history(self, session_id: str) -> List[ChatMessage]:
        """Get chat history for a session"""
        try:
            async with aiosqlite.connect(self.db_path) as db:
                cursor = await db.execute("""
                    SELECT role, content, timestamp, metadata
                    FROM messages
                    WHERE session_id = ?
                    ORDER BY timestamp ASC
                """, (session_id,))
                
                rows = await cursor.fetchall()
                
                messages = []
                for row in rows:
                    messages.append(ChatMessage(
                        content=row[1],
                        role=row[0],
                        session_id=session_id,
                        timestamp=datetime.fromisoformat(row[2]) if row[2] else datetime.now(),
                        metadata=json.loads(row[3]) if row[3] else {}
                    ))
                
                return messages
                
        except Exception as e:
            logger.error(f"❌ Error getting session history: {e}")
            return []
    
    async def store_message(self, message: ChatMessage):
        """Store a chat message"""
        try:
            async with aiosqlite.connect(self.db_path) as db:
                # Ensure session exists
                await db.execute("""
                    INSERT OR IGNORE INTO sessions (id, document_id)
                    VALUES (?, ?)
                """, (message.session_id, message.document_id))
                
                # Store message
                await db.execute("""
                    INSERT INTO messages (id, session_id, role, content, timestamp, metadata)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    str(uuid.uuid4()),
                    message.session_id,
                    message.role,
                    message.content,
                    (message.timestamp or datetime.now()).isoformat(),
                    json.dumps(message.metadata)
                ))
                
                await db.commit()
                
        except Exception as e:
            logger.error(f"❌ Error storing message: {e}")
    
    async def list_sessions(self) -> List[Dict[str, Any]]:
        """List all available sessions"""
        try:
            async with aiosqlite.connect(self.db_path) as db:
                cursor = await db.execute("""
                    SELECT id, document_id, created_at, last_accessed, metadata
                    FROM sessions
                    ORDER BY last_accessed DESC
                """)
                
                rows = await cursor.fetchall()
                
                sessions = []
                for row in rows:
                    sessions.append({
                        "id": row[0],
                        "document_id": row[1],
                        "created_at": row[2],
                        "last_accessed": row[3],
                        "metadata": json.loads(row[4]) if row[4] else {}
                    })
                
                return sessions
                
        except Exception as e:
            logger.error(f"❌ Error listing sessions: {e}")
            return []

    async def create_session(self, session_name: Optional[str] = None, user_id: Optional[str] = None) -> str:
        """Create a new chat session"""
        import uuid
        from datetime import datetime
        
        session_id = str(uuid.uuid4())
        session_name = session_name or f"Session {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        
        try:
            async with aiosqlite.connect(self.db_path) as db:
                await db.execute("""
                    INSERT INTO sessions (id, name, user_id, created_at, updated_at, metadata)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    session_id, 
                    session_name,
                    user_id,
                    datetime.now().isoformat(),
                    datetime.now().isoformat(),
                    json.dumps({"status": "active"})
                ))
                
                await db.commit()
                logger.info(f"✅ Created session: {session_id} - {session_name} for user: {user_id}")
                
            return session_id
            
        except Exception as e:
            logger.error(f"❌ Error creating session: {e}")
            raise e

    async def get_all_sessions(self, user_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get all chat sessions for a user (or all if user_id is None)"""
        try:
            async with aiosqlite.connect(self.db_path) as db:
                if user_id:
                    cursor = await db.execute("""
                        SELECT id, document_id, created_at, last_accessed, metadata, name, updated_at, user_id
                        FROM sessions
                        WHERE user_id = ?
                        ORDER BY COALESCE(updated_at, last_accessed, created_at) DESC
                    """, (user_id,))
                else:
                    # For backward compatibility, get all sessions if no user_id
                    cursor = await db.execute("""
                        SELECT id, document_id, created_at, last_accessed, metadata, name, updated_at, user_id
                        FROM sessions
                        ORDER BY COALESCE(updated_at, last_accessed, created_at) DESC
                    """)
                
                rows = await cursor.fetchall()
                sessions = []
                
                for row in rows:
                    session = {
                        "id": row[0],
                        "document_id": row[1],
                        "created_at": row[2],
                        "last_accessed": row[3],
                        "metadata": json.loads(row[4]) if row[4] else {},
                        "name": row[5] if row[5] else f"Session {row[2][:10]}",
                        "updated_at": row[6] if row[6] else row[3] if row[3] else row[2],
                        "user_id": row[7] if len(row) > 7 else None
                    }
                    sessions.append(session)
                
                return sessions
                
        except Exception as e:
            logger.error(f"❌ Error getting sessions: {e}")
            return []

    async def get_session_messages(self, session_id: str) -> List[Dict[str, Any]]:
        """Get all messages for a session"""
        try:
            async with aiosqlite.connect(self.db_path) as db:
                cursor = await db.execute("""
                    SELECT id, role, content, timestamp
                    FROM messages
                    WHERE session_id = ?
                    ORDER BY timestamp ASC
                """, (session_id,))
                
                rows = await cursor.fetchall()
                messages = []
                
                for row in rows:
                    message = {
                        "id": row[0],
                        "role": row[1],
                        "content": row[2],
                        "timestamp": row[3]
                    }
                    messages.append(message)
                
                return messages
                
        except Exception as e:
            logger.error(f"❌ Error getting session messages: {e}")
            return []

    async def add_message_to_session(self, session_id: str, role: str, content: str):
        """Add a message to a session"""
        from datetime import datetime
        import uuid
        
        try:
            async with aiosqlite.connect(self.db_path) as db:
                # Add message
                message_id = str(uuid.uuid4())
                await db.execute("""
                    INSERT INTO messages (id, session_id, role, content, timestamp)
                    VALUES (?, ?, ?, ?, ?)
                """, (message_id, session_id, role, content, datetime.now().isoformat()))
                
                # Update session updated_at
                await db.execute("""
                    UPDATE sessions 
                    SET updated_at = ?
                    WHERE id = ?
                """, (datetime.now().isoformat(), session_id))
                
                await db.commit()
                logger.info(f"✅ Added {role} message to session {session_id}")
                
        except Exception as e:
            logger.error(f"❌ Error adding message to session: {e}")
            raise e

    async def update_session_name(self, session_id: str, new_name: str):
        """Update session name"""
        from datetime import datetime
        
        try:
            async with aiosqlite.connect(self.db_path) as db:
                await db.execute("""
                    UPDATE sessions 
                    SET name = ?, updated_at = ?
                    WHERE id = ?
                """, (new_name, datetime.now().isoformat(), session_id))
                
                await db.commit()
                logger.info(f"✅ Updated session {session_id} name to: {new_name}")
                
        except Exception as e:
            logger.error(f"❌ Error updating session name: {e}")

    async def delete_session(self, session_id: str) -> bool:
        """Delete a session and its messages from the database"""
        try:
            async with aiosqlite.connect(self.db_path) as db:
                await db.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
                await db.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
                await db.commit()
                logger.info(f"✅ Deleted session and messages for: {session_id}")
            # Remove from cache if present
            if session_id in getattr(self, 'sessions_cache', {}):
                try:
                    sessions_cache = getattr(self, 'sessions_cache')
                    if sessions_cache and session_id in sessions_cache:
                        del sessions_cache[session_id]
                except Exception:
                    pass
            return True
        except Exception as e:
            logger.error(f"❌ Error deleting session {session_id}: {e}")
            return False
            raise e
