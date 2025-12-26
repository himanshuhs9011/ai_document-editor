"""
Health check and diagnostic routes.
"""
from fastapi import APIRouter, HTTPException
from datetime import datetime
from typing import Dict, Any

from ..core.config import DEFAULT_MODEL_NAME, DEFAULT_MODEL_BASE_URL

router = APIRouter(tags=["health"])

# Services (will be set by main app)
llm_service: Any = None
vector_service: Any = None
document_service: Any = None
auth_service: Any = None
model_config: Dict[str, Any] = {}


def set_services(llm: Any, vector: Any, document: Any, auth: Any, config: Dict[str, Any]) -> None:
    """Set the service instances."""
    global llm_service, vector_service, document_service, auth_service, model_config
    llm_service = llm
    vector_service = vector
    document_service = document
    auth_service = auth
    model_config = config


@router.get("/api/health")
async def health_check():
    """Enhanced health check endpoint to verify all services."""
    llm_health = await llm_service.health_check() if llm_service else {"status": "not initialized"}
    vector_health = await vector_service.health_check() if vector_service else {"status": "not initialized"}
    
    return {
        "status": "healthy" if (llm_service and llm_service.is_initialized) else "degraded",
        "timestamp": datetime.now().isoformat(),
        "services": {
            "document_service": "initialized" if document_service else "not initialized",
            "llm_service": "initialized" if llm_service and llm_service.is_initialized else "not initialized",
            "vector_service": "initialized" if vector_service else "not initialized",
            "auth_service": "initialized" if auth_service else "not initialized"
        },
        "llm_status": llm_health,
        "vector_db_status": vector_health,
        "llm_details": {
            "model": model_config.get("model_name", "unknown"),
            "base_url": model_config.get("model_settings", {}).get("base_url", "unknown"),
            "is_ready": llm_service.is_initialized if llm_service else False
        }
    }


@router.post("/api/test-llm")
async def test_llm():
    """Test LLM service with a simple query."""
    try:
        if not llm_service or not llm_service.is_initialized:
            return {
                "success": False,
                "error": "LLM service is not initialized. Please check if Ollama is running.",
                "details": {
                    "llm_service_exists": llm_service is not None,
                    "is_initialized": llm_service.is_initialized if llm_service else False,
                    "model_name": model_config.get("model_name", "unknown"),
                    "base_url": model_config.get("model_settings", {}).get("base_url", DEFAULT_MODEL_BASE_URL)
                }
            }
        
        print("🧪 Testing LLM service...")
        response = await llm_service.generate_response(
            "Say 'Hello, I am working!' in one sentence.",
            context=None,
            system_prompt="You are a helpful assistant. Respond briefly.",
            temperature=0.5
        )
        
        print(f"✅ LLM test successful: {response.content[:100]}")
        
        return {
            "success": True,
            "message": "LLM is working correctly",
            "test_response": response.content,
            "model": model_config.get("model_name", "unknown"),
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        print(f"❌ LLM test failed: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "details": {
                "model_name": model_config.get("model_name", "unknown"),
                "base_url": model_config.get("model_settings", {}).get("base_url", DEFAULT_MODEL_BASE_URL),
                "suggestion": "Make sure Ollama is running with: ollama run " + model_config.get("model_name", DEFAULT_MODEL_NAME)
            }
        }


@router.get("/api/models")
async def list_available_models():
    """List available local models."""
    try:
        models = await llm_service.list_models()
        return {"models": models}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list models: {str(e)}")
