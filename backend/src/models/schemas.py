"""Request and response models shared by routes and services."""
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator


class ChatRequest(BaseModel):
    content: str = Field("", max_length=100_000)
    document_content: Optional[str] = Field(None, max_length=2_000_000)
    session_id: Optional[str] = None
    document_id: Optional[str] = None
    scope: Literal["document", "all"] = "document"
    # quick: retrieval (RAG) plus the start of the document; deep: recursive reading of the whole text (RLM).
    mode: Literal["quick", "deep"] = "quick"


class InlineAiRequest(BaseModel):
    action: Literal["continue", "improve", "shorter", "longer", "grammar", "formal", "summarize", "translate", "table", "ask"]
    text: str = Field("", max_length=50_000)
    context: str = Field("", max_length=20_000)
    argument: str = Field("", max_length=1_000)


class CompletionRequest(BaseModel):
    before: str = Field(..., max_length=5_000)
    after: str = Field("", max_length=2_000)


class StudioRunRequest(BaseModel):
    playbook: str = Field(..., max_length=40)
    format: str = Field("", max_length=40)
    brief: str = Field("", max_length=8_000)
    fields: Dict[str, str] = Field(default_factory=dict, max_length=20)
    document_ids: List[str] = Field(default_factory=list, max_length=20)
    depth: Literal["quick", "thorough"] = "quick"

    @field_validator("fields")
    @classmethod
    def _short_answers(cls, value: Dict[str, str]) -> Dict[str, str]:
        if any(len(k) > 40 or len(v) > 8_000 for k, v in value.items()):
            raise ValueError("Each answer must be under 8,000 characters")
        return value


class SessionCreateRequest(BaseModel):
    session_name: Optional[str] = Field(None, max_length=200)
    name: Optional[str] = Field(None, max_length=200)


class SessionRenameRequest(BaseModel):
    session_name: Optional[str] = Field(None, max_length=200)


class DocumentContentRequest(BaseModel):
    content: str = Field("", max_length=10_000_000)
    html_content: Optional[str] = Field(None, max_length=10_000_000)


class ExportDocxRequest(BaseModel):
    content: str = Field("", max_length=10_000_000)
    filename: Optional[str] = None


class ApiKeyCreate(BaseModel):
    provider: str
    api_key: str = Field(..., min_length=8, max_length=500)
    model: str = Field(..., min_length=1, max_length=200)
    base_url: Optional[str] = Field(None, max_length=500)


class ApiKeyUpdate(BaseModel):
    is_active: bool


class DocumentResponse(BaseModel):
    document_id: str
    filename: str
    file_type: str
    page_count: int
    extracted_text: Optional[str] = None
    html_content: Optional[str] = None
    session_id: Optional[str] = None
    content: Optional[str] = None
    pages: List[Dict[str, Any]] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.now)


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


class HealthStatus(BaseModel):
    service: str
    status: str
    details: Dict[str, Any] = Field(default_factory=dict)
    last_check: datetime = Field(default_factory=datetime.now)
