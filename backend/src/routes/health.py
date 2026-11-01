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
        # No live call to the model here: anyone can reach this endpoint, and the desktop app polls it while
        # starting (a provider call would hang offline and could expose provider error text).
        "mode": settings.app_mode,
    }
