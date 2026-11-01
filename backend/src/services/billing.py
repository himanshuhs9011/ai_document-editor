"""Paywall rules: editor features are free; AI needs your own key, the free daily trial, or Pro."""
from datetime import datetime, timezone

from fastapi import HTTPException, status

from ..config import settings
from ..db import usage
from ..models.user import UserResponse
from . import keys
from .llm import LLMService, ModelTarget


def has_pro(user: UserResponse) -> bool:
    return user.plan == "pro" and (user.plan_expires_at is None or user.plan_expires_at > datetime.now(timezone.utc))


def daily_limit(user: UserResponse) -> int:
    return settings.pro_ai_daily if has_pro(user) else settings.free_ai_daily


async def ai_target(user: UserResponse, llm: LLMService) -> ModelTarget:
    """Pick the model for this request, counting it against the daily quota unless the user's own key pays."""
    own = await keys.active_target(user.id)
    if own:
        return own
    limit = daily_limit(user)
    if not await usage.consume(user.id, limit):
        plan_hint = "" if has_pro(user) else " or upgrade to Pro"
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail={
            "code": "upgrade_required",
            "message": f"You've used all {limit} AI requests for today. Add your own API key in Settings{plan_hint}.",
        })
    return llm.default


async def charge_extra(user: UserResponse, target: ModelTarget) -> bool:
    """Count one more request for multi-step work (each report section); free when the user's own key pays.
    In the desktop app the gateway counts every call itself (and refuses once the allowance is used up)."""
    if settings.app_mode == "local":
        return True
    return target.is_user_key or await usage.consume(user.id, daily_limit(user))


async def premium_target(user: UserResponse, llm: LLMService) -> ModelTarget:
    """Autocomplete fires constantly while typing, so it needs the user's own key or Pro."""
    own = await keys.active_target(user.id)
    if own:
        return own
    if not has_pro(user):
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail={
            "code": "upgrade_required",
            "message": "Autocomplete needs your own API key (add one in AI & Plan) or the Pro plan.",
        })
    return await ai_target(user, llm)


async def status_for(user: UserResponse) -> dict:
    own = await keys.active_target(user.id)
    return {
        "plan": "pro" if has_pro(user) else "free",
        "plan_expires_at": user.plan_expires_at.isoformat() if has_pro(user) and user.plan_expires_at else None,
        "ai_used_today": await usage.used_today(user.id),
        "ai_daily_limit": daily_limit(user),
        "using_own_key": own is not None,
        "active_model": f"{own.model} on {own.provider}" if own else None,
    }
