"""Service health check."""
from datetime import datetime

from fastapi import APIRouter, Depends

from ..config import settings
from ..db.database import fetchval
from ..deps import Services, get_services

router = APIRouter(tags=["health"])


@router.get("/api/health")
async def health(services: Services = Depends(get_services)):
    try:
        database = "healthy" if await fetchval("SELECT 1") == 1 else "unhealthy"
    except Exception:
        database = "unhealthy"
    llm_ready = services.llm.is_initialized
    return {
        "status": "healthy" if llm_ready and database == "healthy" else "degraded",
        "timestamp": datetime.now().isoformat(),
        "services": {"llm_service": "initialized" if llm_ready else "not initialized", "database": database},
        "llm_status": await services.llm.health_check(),
        "llm_details": {"provider": settings.llm_provider, "model": settings.llm_model, "is_ready": llm_ready},
    }
