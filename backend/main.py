from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import uvicorn
import os

# Config - centralized defaults
from src.core.config import (
    load_model_config, DEFAULT_MODEL_NAME, DEFAULT_MODEL_BASE_URL, 
    DEFAULT_TIMEOUT, DEFAULT_NUM_PREDICT, DEFAULT_EMBEDDING_MODEL
)

# Services
from src.services.document_service import DocumentService
from src.services.llm_service import LLMService
from src.services.vector_service import VectorService
from src.services.auth_service import AuthService
from src.agents.document_agent import DocumentAgent

# Routes
from src.routes import auth_router, chat_router, document_router, session_router, health_router
from src.routes.auth import set_auth_service
from src.routes.chat import set_services as set_chat_services
from src.routes.document import set_services as set_document_services
from src.routes.session import set_document_service as set_session_document_service
from src.routes.health import set_services as set_health_services


# =============================================================================
# CONFIGURATION
# =============================================================================

# Load configuration from model-config.json
model_config = load_model_config()


# =============================================================================
# SERVICE INITIALIZATION
# =============================================================================

# Initialize core services
document_service = DocumentService()
llm_service = LLMService(
    model_name=model_config.get("model_name", DEFAULT_MODEL_NAME),
    base_url=model_config.get("model_settings", {}).get("base_url", DEFAULT_MODEL_BASE_URL),
    timeout=model_config.get("model_settings", {}).get("timeout", DEFAULT_TIMEOUT),
    default_num_predict=model_config.get("model_settings", {}).get("num_predict", DEFAULT_NUM_PREDICT)
)
vector_service = VectorService(
    model_name=model_config.get("embedding_model", DEFAULT_EMBEDDING_MODEL),
    base_url=model_config.get("model_settings", {}).get("base_url", DEFAULT_MODEL_BASE_URL)
)
document_agent = DocumentAgent(llm_service, vector_service)
auth_service = AuthService()


# =============================================================================
# APPLICATION LIFECYCLE
# =============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager for startup and shutdown."""
    # Startup
    print("🚀 Starting application services...")
    
    # Ensure data directory exists
    os.makedirs("data", exist_ok=True)
    os.makedirs("data/uploads", exist_ok=True)
    os.makedirs("data/exports", exist_ok=True)
    os.makedirs("data/sessions", exist_ok=True)
    
    # Initialize services
    services = [
        ("auth", auth_service),
        ("document", document_service),
        ("llm", llm_service),
        ("vector", vector_service),
    ]
    
    for name, service in services:
        try:
            print(f"🔧 Initializing {name} service...")
            await service.initialize()
        except Exception as e:
            print(f"⚠️ {name.capitalize()} service initialization failed: {e}")
    
    # Configure route services
    set_auth_service(auth_service)
    set_chat_services(document_service, llm_service, vector_service, document_agent)
    set_document_services(document_service, vector_service, document_agent)
    set_session_document_service(document_service)
    set_health_services(llm_service, vector_service, document_service, auth_service, model_config)
    
    print("✅ Application startup complete")
    
    yield
    
    # Shutdown
    print("🔄 Shutting down services...")


# =============================================================================
# APPLICATION SETUP
# =============================================================================

app = FastAPI(
    title="Document AI Editor",
    description="AI-powered document editing with offline capabilities",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware - Allow all origins for LAN access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static file serving
app.mount("/exports", StaticFiles(directory="data/exports"), name="exports")

# Register routers
app.include_router(auth_router)
app.include_router(chat_router)
app.include_router(document_router)
app.include_router(session_router)
app.include_router(health_router)


# =============================================================================
# ENTRY POINT
# =============================================================================

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
