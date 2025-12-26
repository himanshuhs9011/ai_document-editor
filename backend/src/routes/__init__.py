"""
Route modules for FastAPI endpoints.
"""
from .auth import router as auth_router
from .chat import router as chat_router
from .document import router as document_router
from .session import router as session_router
from .health import router as health_router

__all__ = [
    "auth_router",
    "chat_router", 
    "document_router",
    "session_router",
    "health_router",
]
