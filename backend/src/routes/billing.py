"""The current user's plan and AI usage, for the paywall UI."""
from fastapi import APIRouter, Depends

from ..deps import Services, get_current_user, get_services
from ..models.user import UserResponse
from ..services import billing

router = APIRouter(prefix="/api/billing", tags=["billing"])


@router.get("")
async def billing_status(user: UserResponse = Depends(get_current_user), services: Services = Depends(get_services)):
    # server_ai_ready says whether the app's own model is configured, so the UI can point free users at their own key.
    return {**await billing.status_for(user), "server_ai_ready": services.llm.is_initialized}
