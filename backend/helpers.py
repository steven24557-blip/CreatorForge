"""Shared helper functions for CreatorForge."""
import time
import random
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import HTTPException
from routers.deps import db

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def today_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")

def public_user(u: dict) -> dict:
    return {k: v for k, v in u.items() if k not in ("password", "_id")}

# Feature flags (simplified)
DEFAULT_FLAGS = {
    "beta_premium_enabled": True,
    "demo_account_visible": False,
    "allow_new_signups": True,
}
_FLAGS = dict(DEFAULT_FLAGS)
_FLAGS_TS = 0.0
FLAGS_TTL = 10.0

async def ensure_flags_fresh() -> dict:
    global _FLAGS, _FLAGS_TS
    if time.time() - _FLAGS_TS > FLAGS_TTL:
        doc = await db.app_config.find_one({"_id": "feature_flags"})
        if doc:
            f = doc.get("flags", {})
            _FLAGS = {k: bool(f.get(k, DEFAULT_FLAGS[k])) for k in DEFAULT_FLAGS}
        _FLAGS_TS = time.time()
    return _FLAGS

async def set_flags(patch: dict, updated_by: str = "admin") -> dict:
    global _FLAGS
    clean = {k: bool(v) for k, v in patch.items() if k in DEFAULT_FLAGS and v is not None}
    if clean:
        update = {f"flags.{k}": v for k, v in clean.items()}
        update["updated_at"] = now_iso()
        await db.app_config.update_one(
            {"_id": "feature_flags"}, {"$set": update}, upsert=True
        )
    return await ensure_flags_fresh()

def is_premium(user: dict) -> bool:
    if _FLAGS.get("beta_premium_enabled"):
        return True
    if user.get("plan") == "premium":
        return True
    return False

async def check_and_count_generation(user: dict):
    await ensure_flags_fresh()
    if is_premium(user):
        return
    # simplified check
    pass

async def refund_generation(user: dict):
    pass

async def check_and_count_packaging(user: dict):
    pass

async def refund_packaging(user: dict):
    pass

def memory_context(user: dict) -> str:
    return ""

PACKAGES = {
    "monthly": {"name": "Premium Monthly", "amount": 14.99, "currency": "usd", "days": 30},
    "yearly": {"name": "Premium Annual", "amount": 149.00, "currency": "usd", "days": 365},
}

IAP_PRODUCTS = {
    "pro.monthly": "monthly",
    "pro.yearly": "yearly",
}

PACKAGING_STYLES = {
    "box": "a rigid product box / carton",
    "pouch": "a stand-up flexible pouch",
    "bottle": "a labeled bottle",
    "bag": "a branded shopping/tote bag",
}

ADMT_NOTICE_VERSION = "2026-06"
ADMIN_API_KEY = ""
