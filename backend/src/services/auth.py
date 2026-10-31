"""Password hashing, JWT tokens, and user registration/login."""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from fastapi import HTTPException, status

from ..config import settings
from ..db import users
from ..models.user import UserCreate, UserResponse

ALGORITHM = "HS256"
TOKEN_LIFETIME = timedelta(days=7)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def create_access_token(user_id: str, email: str) -> str:
    payload = {"user_id": user_id, "email": email, "exp": datetime.now(timezone.utc) + TOKEN_LIFETIME}
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_token(token: str) -> Optional[str]:
    """Return the user id inside a valid token, or None."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has expired")
    except jwt.PyJWTError:
        return None
    return payload.get("user_id")


def _to_response(row: dict) -> UserResponse:
    return UserResponse(**{key: row[key] for key in UserResponse.model_fields if key in row})


async def register(data: UserCreate) -> UserResponse:
    conflict = await users.find_conflict(data.email, data.username)
    if conflict == "email":
        raise HTTPException(status_code=400, detail="Email already registered")
    if conflict == "username":
        raise HTTPException(status_code=400, detail="Username already taken")
    row = await users.insert(str(uuid.uuid4()), data.email, data.username, data.full_name, hash_password(data.password))
    return _to_response(row)


async def authenticate(email: str, password: str) -> Optional[UserResponse]:
    row = await users.get_by_email(email)
    if not row or not verify_password(password, row["password_hash"]):
        return None
    if not row["is_active"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User account is disabled")
    return _to_response(row)


async def get_user(user_id: str) -> Optional[UserResponse]:
    row = await users.get_by_id(user_id)
    return _to_response(row) if row else None
