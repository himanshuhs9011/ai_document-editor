from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Union
from datetime import datetime
from enum import Enum

class DocumentFormat(str, Enum):
    PDF = "pdf"
    DOCX = "docx"

class MessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"

class ChatMessage(BaseModel):
    content: str
    role: MessageRole = MessageRole.USER
    document_id: Optional[str] = None
    session_id: str
    timestamp: Optional[datetime] = Field(default_factory=datetime.now)
    metadata: Optional[Dict[str, Any]] = {}

class DocumentResponse(BaseModel):
    document_id: str
    filename: str
    file_type: str
    page_count: int
    extracted_text: Optional[str] = None
    html_content: Optional[str] = None  # HTML from DOCX conversion
    session_id: Optional[str] = None
    content: Optional[str] = None  # Convenience field combining html/text
    pages: List[Dict[str, Any]] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.now)

class EditRequest(BaseModel):
    document_id: str
    session_id: str
    instruction: str
    target_section: Optional[str] = None
    page_number: Optional[int] = None
    preserve_formatting: bool = True
    context: Optional[str] = None

class EditSuggestion(BaseModel):
    type: str  # "replace", "insert", "delete", "format"
    original_text: Optional[str] = None
    new_text: Optional[str] = None
    position: Dict[str, Any]  # page, coordinates, etc.
    confidence: float
    explanation: str

class ExportRequest(BaseModel):
    document_id: str
    format: DocumentFormat
    filename: Optional[str] = None
    include_changes: bool = True
    quality: str = "high"  # "low", "medium", "high"

class SessionHistory(BaseModel):
    session_id: str
    messages: List[ChatMessage]
    created_at: datetime = Field(default_factory=datetime.now)
    last_accessed: datetime = Field(default_factory=datetime.now)
    document_id: Optional[str] = None

class VectorSearchResult(BaseModel):
    content: str
    score: float
    metadata: Dict[str, Any]
    page_number: Optional[int] = None

class LLMResponse(BaseModel):
    content: str
    model: str
    tokens_used: Optional[int] = None
    processing_time: Optional[float] = None
    confidence: Optional[float] = None

class DocumentPage(BaseModel):
    page_number: int
    text_content: str
    images: List[str] = []  # base64 encoded images
    annotations: List[Dict[str, Any]] = []
    dimensions: Dict[str, float]  # width, height
    html_content: Optional[str] = None

class OCRResult(BaseModel):
    text: str
    confidence: float
    bounding_boxes: List[Dict[str, Any]]
    language: Optional[str] = "en"

class HealthStatus(BaseModel):
    service: str
    status: str  # "healthy", "degraded", "unhealthy"
    details: Optional[Dict[str, Any]] = {}
    last_check: datetime = Field(default_factory=datetime.now)
