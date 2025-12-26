import os
import jwt
import aiosqlite
import bcrypt
from datetime import datetime, timedelta
from typing import Optional
from fastapi import HTTPException, status
from ..models.user import UserCreate, UserResponse, TokenData
import uuid
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# JWT Configuration
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-this-in-production-12345678")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

class AuthService:
    """Service for user authentication and authorization"""
    
    def __init__(self, db_path: str = "data/sessions.db"):
        self.db_path = db_path
    
    async def initialize(self):
        """Initialize authentication database tables"""
        try:
            # Ensure data directory exists
            os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
            
            async with aiosqlite.connect(self.db_path) as db:
                # Create users table
                await db.execute("""
                    CREATE TABLE IF NOT EXISTS users (
                        id TEXT PRIMARY KEY,
                        email TEXT UNIQUE NOT NULL,
                        username TEXT UNIQUE NOT NULL,
                        full_name TEXT,
                        password_hash TEXT NOT NULL,
                        is_active INTEGER DEFAULT 1,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                
                # Create index on email for faster lookups
                await db.execute("""
                    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)
                """)
                
                # Check if sessions table exists before trying to alter it
                cursor = await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'")
                sessions_exists = await cursor.fetchone()
                
                if sessions_exists:
                    # Check if user_id column exists
                    cursor = await db.execute("PRAGMA table_info(sessions)")
                    columns = await cursor.fetchall()
                    column_names = [col[1] for col in columns]
                    
                    # Add user_id column to sessions table if not exists
                    if 'user_id' not in column_names:
                        try:
                            await db.execute("ALTER TABLE sessions ADD COLUMN user_id TEXT")
                            print("✅ Added user_id column to sessions table")
                        except Exception as e:
                            print(f"⚠️ Could not add user_id column: {e}")
                    
                    # Create index on sessions.user_id
                    await db.execute("""
                        CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)
                    """)
                
                await db.commit()
                print("✅ Auth database tables initialized")
        except Exception as e:
            print(f"⚠️ Auth service initialization failed: {e}")
            # Don't raise, allow app to continue
    
    def hash_password(self, password: str) -> str:
        """Hash a password using bcrypt"""
        salt = bcrypt.gensalt()
        return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')
    
    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """Verify a password against its hash"""
        return bcrypt.checkpw(
            plain_password.encode('utf-8'),
            hashed_password.encode('utf-8')
        )
    
    def create_access_token(self, user_id: str, email: str) -> str:
        """Create a JWT access token"""
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        to_encode = {
            "user_id": user_id,
            "email": email,
            "exp": expire
        }
        return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    
    def decode_token(self, token: str) -> Optional[TokenData]:
        """Decode and validate JWT token"""
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            user_id: str = payload.get("user_id")
            email: str = payload.get("email")
            
            if user_id is None or email is None:
                return None
            
            return TokenData(user_id=user_id, email=email)
        except jwt.ExpiredSignatureError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired"
            )
        except jwt.PyJWTError:
            return None
    
    async def create_user(self, user_data: UserCreate) -> UserResponse:
        """Create a new user"""
        async with aiosqlite.connect(self.db_path) as db:
            # Check if email already exists
            async with db.execute(
                "SELECT id FROM users WHERE email = ?",
                (user_data.email,)
            ) as cursor:
                if await cursor.fetchone():
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Email already registered"
                    )
            
            # Check if username already exists
            async with db.execute(
                "SELECT id FROM users WHERE username = ?",
                (user_data.username,)
            ) as cursor:
                if await cursor.fetchone():
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Username already taken"
                    )
            
            # Create new user
            user_id = str(uuid.uuid4())
            password_hash = self.hash_password(user_data.password)
            created_at = datetime.utcnow()
            
            await db.execute("""
                INSERT INTO users (id, email, username, full_name, password_hash, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (
                user_id,
                user_data.email,
                user_data.username,
                user_data.full_name,
                password_hash,
                created_at
            ))
            await db.commit()
            
            return UserResponse(
                id=user_id,
                email=user_data.email,
                username=user_data.username,
                full_name=user_data.full_name,
                created_at=created_at,
                is_active=True
            )
    
    async def authenticate_user(self, email: str, password: str) -> Optional[UserResponse]:
        """Authenticate user with email and password"""
        async with aiosqlite.connect(self.db_path) as db:
            async with db.execute("""
                SELECT id, email, username, full_name, password_hash, is_active, created_at
                FROM users
                WHERE email = ?
            """, (email,)) as cursor:
                row = await cursor.fetchone()
                
                if not row:
                    return None
                
                user_id, email, username, full_name, password_hash, is_active, created_at = row
                
                # Verify password
                if not self.verify_password(password, password_hash):
                    return None
                
                # Check if user is active
                if not is_active:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="User account is disabled"
                    )
                
                return UserResponse(
                    id=user_id,
                    email=email,
                    username=username,
                    full_name=full_name,
                    created_at=datetime.fromisoformat(created_at),
                    is_active=bool(is_active)
                )
    
    async def get_user_by_id(self, user_id: str) -> Optional[UserResponse]:
        """Get user by ID"""
        async with aiosqlite.connect(self.db_path) as db:
            async with db.execute("""
                SELECT id, email, username, full_name, is_active, created_at
                FROM users
                WHERE id = ?
            """, (user_id,)) as cursor:
                row = await cursor.fetchone()
                
                if not row:
                    return None
                
                user_id, email, username, full_name, is_active, created_at = row
                
                return UserResponse(
                    id=user_id,
                    email=email,
                    username=username,
                    full_name=full_name,
                    created_at=datetime.fromisoformat(created_at),
                    is_active=bool(is_active)
                )
