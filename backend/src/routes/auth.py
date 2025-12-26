"""
Authentication routes.
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import TYPE_CHECKING, Any
from ..services.auth_dependencies import get_current_user
from ..models.user import UserCreate, UserLogin, UserResponse, Token

if TYPE_CHECKING:
    from ..services.auth_service import AuthService

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Auth service instance (will be set by main app)
auth_service: Any = None


def set_auth_service(service: "AuthService") -> None:
    """Set the auth service instance."""
    global auth_service
    auth_service = service


@router.post("/register", response_model=Token)
async def register(user_data: UserCreate):
    """Register a new user."""
    try:
        user = await auth_service.create_user(user_data)
        access_token = auth_service.create_access_token(
            user_id=user.id,
            email=user.email
        )
        return Token(
            access_token=access_token,
            token_type="bearer",
            user=user
        )
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to register user: {str(e)}"
        )


@router.post("/login", response_model=Token)
async def login(user_data: UserLogin):
    """Login with email and password."""
    try:
        user = await auth_service.authenticate_user(
            email=user_data.email,
            password=user_data.password
        )
        if not user:
            raise HTTPException(
                status_code=401,
                detail="Incorrect email or password"
            )
        access_token = auth_service.create_access_token(
            user_id=user.id,
            email=user.email
        )
        return Token(
            access_token=access_token,
            token_type="bearer",
            user=user
        )
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to login: {str(e)}"
        )


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: UserResponse = Depends(get_current_user)):
    """Get current authenticated user info."""
    return current_user
