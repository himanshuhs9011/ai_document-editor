"""
Service initialization and dependency injection.
Centralizes all service creation and configuration.
"""
from typing import Optional
from dataclasses import dataclass

from .config import (
    settings, load_model_config, 
    DEFAULT_MODEL_NAME, DEFAULT_MODEL_BASE_URL, DEFAULT_TIMEOUT, DEFAULT_NUM_PREDICT
)
from ..services.document_service import DocumentService
from ..services.llm_service import LLMService
from ..services.vector_service import VectorService
from ..services.auth_service import AuthService
from ..agents.document_agent import DocumentAgent


@dataclass
class Services:
    """Container for all application services."""
    document_service: DocumentService
    llm_service: LLMService
    vector_service: VectorService
    auth_service: AuthService
    document_agent: DocumentAgent


def create_services(config: Optional[dict] = None) -> Services:
    """Create and configure all application services."""
    if config is None:
        config = load_model_config()
    
    document_service = DocumentService()
    
    llm_service = LLMService(
        model_name=config.get("model_name", DEFAULT_MODEL_NAME),
        base_url=config.get("model_settings", {}).get("base_url", DEFAULT_MODEL_BASE_URL),
        timeout=config.get("model_settings", {}).get("timeout", DEFAULT_TIMEOUT),
        default_num_predict=config.get("model_settings", {}).get("num_predict", DEFAULT_NUM_PREDICT)
    )
    
    vector_service = VectorService()
    auth_service = AuthService()
    document_agent = DocumentAgent(llm_service, vector_service)
    
    return Services(
        document_service=document_service,
        llm_service=llm_service,
        vector_service=vector_service,
        auth_service=auth_service,
        document_agent=document_agent
    )


async def initialize_services(services: Services) -> None:
    """Initialize all services asynchronously."""
    print("🚀 Starting application services...")
    
    print("🔧 Initializing auth service...")
    await services.auth_service.initialize()
    print("✅ Auth database tables initialized")
    
    print("🔧 Initializing document service...")
    await services.document_service.initialize()
    
    print("🔧 Initializing LLM service...")
    await services.llm_service.initialize()
    
    print("🔧 Initializing vector service...")
    await services.vector_service.initialize()
    
    print("✅ Application startup complete")


async def shutdown_services(services: Services) -> None:
    """Gracefully shutdown all services."""
    print("🛑 Shutting down application services...")
    
    if services.llm_service.client:
        await services.llm_service.close()
    
    if services.vector_service.client:
        await services.vector_service.close()
    
    print("✅ All services shut down gracefully")


# Global services instance (lazy initialization)
_services: Optional[Services] = None


def get_services() -> Services:
    """Get the global services instance."""
    global _services
    if _services is None:
        _services = create_services()
    return _services


def set_services(services: Services) -> None:
    """Set the global services instance."""
    global _services
    _services = services
