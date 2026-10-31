"""Register, log in, and read the current user."""
from fastapi import APIRouter, Depends, HTTPException, Request

from .. import cache
from ..deps import client_ip, get_current_user
from ..models.user import Token, UserCreate, UserLogin, UserResponse
from ..services import auth

router = APIRouter(prefix="/api/auth", tags=["auth"])

LOGIN_ATTEMPTS = 10
LOGIN_WINDOW_SECONDS = 300


def _token_for(user: UserResponse) -> Token:
    return Token(access_token=auth.create_access_token(user.id, user.email), user=user)


async def _limit(request: Request, action: str, identity: str) -> None:
    if not await cache.allow(f"{action}:{client_ip(request)}:{identity.lower()}", LOGIN_ATTEMPTS, LOGIN_WINDOW_SECONDS):
        raise HTTPException(status_code=429, detail="Too many attempts. Please wait a few minutes.")


@router.post("/register", response_model=Token)
async def register(data: UserCreate, request: Request):
    await _limit(request, "register", "any")
    return _token_for(await auth.register(data))


@router.post("/login", response_model=Token)
async def login(data: UserLogin, request: Request):
    await _limit(request, "login", data.email)
    user = await auth.authenticate(data.email, data.password)
    if not user:
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    return _token_for(user)


@router.get("/me", response_model=UserResponse)
async def me(current_user: UserResponse = Depends(get_current_user)):
    return current_user
