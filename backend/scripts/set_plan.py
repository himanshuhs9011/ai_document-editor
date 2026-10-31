"""Give a user the Pro plan by hand (until a payment webhook does it).

Usage (from backend/):  python scripts/set_plan.py user@example.com pro 30   |   python scripts/set_plan.py user@example.com free
"""
import asyncio
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.config import settings  # noqa: E402
from src.db import database, users  # noqa: E402


async def main(email: str, plan: str, days: int) -> None:
    await database.connect(settings.database_url)
    user = await users.get_by_email(email)
    if not user:
        print(f"No user with email {email}")
    else:
        expires = datetime.now(timezone.utc) + timedelta(days=days) if plan == "pro" else None
        await users.set_plan(user["id"], plan, expires)
        print(f"{email} is now on {plan}" + (f" until {expires:%Y-%m-%d}" if expires else ""))
    await database.close()


if __name__ == "__main__":
    if len(sys.argv) < 3 or sys.argv[2] not in ("free", "pro"):
        sys.exit(__doc__)
    asyncio.run(main(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 30))
