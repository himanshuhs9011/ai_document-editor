"""The desktop app's link to the online gateway: who is signed in, their AI allowance, and account requests.

Accounts, plans and API keys live online; documents and chats stay on the PC. The local backend cannot verify
sign-in tokens (only the gateway holds the signing key), so it asks the gateway and caches the answer. Offline it
reads the user id from the token unverified: anyone who can run programs on this PC can read the local database
file anyway, so this keeps editing working without opening anything new.
"""
import time
from datetime import datetime, timezone
from typing import Dict, Optional, Tuple

import httpx
import jwt

from ..models.user import UserResponse

IDENTITY_CACHE_SECONDS = 300
FORWARDED_HEADERS = ("authorization", "content-type")


class GatewayUnavailable(RuntimeError):
    """The gateway could not be reached (offline, or the server is down)."""


class GatewayClient:
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.client = httpx.AsyncClient(timeout=httpx.Timeout(30.0, read=60.0))
        self.identities: Dict[str, Tuple[float, UserResponse]] = {}

    async def _get(self, path: str, token: str) -> httpx.Response:
        try:
            return await self.client.get(f"{self.base_url}{path}", headers={"Authorization": f"Bearer {token}"})
        except httpx.HTTPError as error:
            raise GatewayUnavailable(str(error)) from None

    async def me(self, token: str) -> Optional[UserResponse]:
        """The signed-in user, or None when the gateway rejects the token."""
        cached = self.identities.get(token)
        if cached and cached[0] > time.monotonic():
            return cached[1]
        response = await self._get("/api/auth/me", token)
        if response.status_code == 401:
            self.identities.pop(token, None)
            return None
        if response.status_code != 200:
            raise GatewayUnavailable(f"gateway answered {response.status_code}")
        user = UserResponse(**response.json())
        self.identities[token] = (time.monotonic() + IDENTITY_CACHE_SECONDS, user)
        return user

    @staticmethod
    def offline_user(token: str) -> Optional[UserResponse]:
        """Who the token says it belongs to, unverified, for working offline."""
        try:
            claims = jwt.decode(token, options={"verify_signature": False, "verify_exp": False})
        except jwt.PyJWTError:
            return None
        user_id, email = claims.get("user_id"), claims.get("email")
        if not user_id or not email:
            return None
        return UserResponse(id=user_id, email=email, username=email.split("@")[0], created_at=datetime.now(timezone.utc))

    async def billing(self, token: str) -> dict:
        """The user's plan and today's AI usage, straight from the gateway."""
        response = await self._get("/api/billing", token)
        if response.status_code != 200:
            raise GatewayUnavailable(f"gateway answered {response.status_code}")
        return response.json()

    async def forward(self, method: str, path: str, query: str, headers: Dict[str, str], body: bytes) -> httpx.Response:
        """Pass an account request (sign-in, plan, API keys) through to the gateway unchanged."""
        url = f"{self.base_url}{path}" + (f"?{query}" if query else "")
        kept = {name: value for name, value in headers.items() if name.lower() in FORWARDED_HEADERS}
        try:
            return await self.client.request(method, url, headers=kept, content=body)
        except httpx.HTTPError as error:
            raise GatewayUnavailable(str(error)) from None

    async def close(self) -> None:
        await self.client.aclose()
