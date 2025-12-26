from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime

class UserBase(BaseModel):
    """Base user model"""
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50)
    full_name: Optional[str] = None

class UserCreate(UserBase):
    """User creation model"""
    password: str = Field(..., min_length=6)

class UserLogin(BaseModel):
    """User login model"""
    email: EmailStr
    password: str

class UserResponse(UserBase):
    """User response model (no password)"""
    id: str
    created_at: datetime
    is_active: bool = True
    
    class Config:
        from_attributes = True

class Token(BaseModel):
    """JWT token response"""
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class TokenData(BaseModel):
    """Token payload data"""
    user_id: str
    email: str
