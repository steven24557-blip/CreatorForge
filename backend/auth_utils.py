"""Auth utilities: JWT email/password + Emergent Google session tokens (unified)."""
import os
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path

import bcrypt
import jwt
import httpx
from dotenv import load_dotenv
from fastapi import Header, HTTPException

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGO = "HS256"
JWT_TTL_DAYS = 30
EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except Exception:
        return False


def make_jwt(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_TTL_DAYS),
        "typ": "jwt",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def new_user_id() -> str:
    return f"user_{uuid.uuid4().hex[:12]}"


async def fetch_emergent_session(session_id: str) -> dict:
    async with httpx.AsyncClient(timeout=15) as cx:
        r = await cx.get(EMERGENT_SESSION_URL, headers={"X-Session-ID": session_id})
        r.raise_for_status()
        return r.json()


def _aware(dt):
    if dt is None:
        return None
    if isinstance(dt, str):
        try:
            dt = datetime.fromisoformat(dt)
        except Exception:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def build_get_current_user(db):
    async def get_current_user(authorization: str = Header(None)):
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing bearer token")
        token = authorization.split(" ", 1)[1].strip()

        user_id = None
        # 1) Try our own JWT
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
            user_id = payload.get("sub")
        except Exception:
            user_id = None

        # 2) Fall back to an Emergent Google session token
        if not user_id:
            session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
            if not session:
                raise HTTPException(status_code=401, detail="Invalid token")
            exp = _aware(session.get("expires_at"))
            if exp and exp < datetime.now(timezone.utc):
                raise HTTPException(status_code=401, detail="Session expired")
            user_id = session.get("user_id")

        user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user

    return get_current_user
