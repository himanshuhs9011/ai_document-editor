"""Bring-your-own-key: users add, switch and remove their own model-provider API keys."""
from fastapi import APIRouter, Depends, HTTPException

from ..db import api_keys
from ..deps import Services, get_current_user, get_services
from ..models.schemas import ApiKeyCreate, ApiKeyUpdate
from ..models.user import UserResponse
from ..services import keys
from ..services.llm import LLMError
from ..services.providers import PROVIDERS, InvalidProviderUrl

router = APIRouter(prefix="/api/keys", tags=["api-keys"])


@router.get("/providers")
async def providers():
    return {"providers": [{"id": key, **value} for key, value in PROVIDERS.items()]}


@router.get("")
async def list_keys(user: UserResponse = Depends(get_current_user)):
    return {"keys": await api_keys.list_for_user(user.id)}


@router.post("")
async def add_key(request: ApiKeyCreate, user: UserResponse = Depends(get_current_user),
                  services: Services = Depends(get_services)):
    try:
        key = await keys.save_key(services.llm, user.id, request.provider, request.api_key.strip(),
                                  request.model.strip(), request.base_url)
    except InvalidProviderUrl as error:
        raise HTTPException(status_code=400, detail=str(error))
    except LLMError as error:
        raise HTTPException(status_code=400, detail=f"That key didn't work: {error}")
    return {"key": key}


@router.patch("/{key_id}")
async def update_key(key_id: str, request: ApiKeyUpdate, user: UserResponse = Depends(get_current_user)):
    if not await api_keys.set_active(key_id, user.id, request.is_active):
        raise HTTPException(status_code=404, detail="Key not found")
    return {"keys": await api_keys.list_for_user(user.id)}


@router.delete("/{key_id}")
async def delete_key(key_id: str, user: UserResponse = Depends(get_current_user)):
    if not await api_keys.delete(key_id, user.id):
        raise HTTPException(status_code=404, detail="Key not found")
    return {"status": "deleted"}
