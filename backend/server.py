"""CreatorForge backend — auth, projects/ideas, brand kits, AI assets, payments, milestones."""
import os
import json
import time
import uuid
import random
import logging
import tempfile

import httpx
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import Optional, List

from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Request, Header
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr
from dotenv import load_dotenv

from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout,
    CheckoutSessionRequest,
)

import ai_service as ai
import auth_utils as auth
from ownership import require_owner

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("creatorforge")

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

STRIPE_API_KEY = os.environ["STRIPE_API_KEY"]

app = FastAPI(title="CreatorForge API")
api = APIRouter(prefix="/api")
get_current_user = auth.build_get_current_user(db)

# ----------------------------- constants -----------------------------
FREE_DAILY_GENERATIONS = 5
FREE_DAILY_EXPORTS = 3

PACKAGES = {
    "monthly": {"name": "Premium Monthly", "amount": 14.99, "currency": "usd", "days": 30},
    "yearly": {"name": "Premium Annual", "amount": 149.00, "currency": "usd", "days": 365},
}

# Native In-App Purchase product IDs (App Store / Google Play) -> internal plan.
# Configure these exact IDs in App Store Connect (auto-renewable subscription group)
# and Google Play Console (subscription base plans).
IAP_PRODUCTS = {
    "pro.monthly": "monthly",
    "pro.yearly": "yearly",
}

# Store credentials (provided by the user when ready; empty = not yet configured).
APPLE_SHARED_SECRET = os.environ.get("APPLE_SHARED_SECRET", "").strip()
APPLE_BUNDLE_ID = os.environ.get("APPLE_BUNDLE_ID", "").strip()
GOOGLE_PLAY_PACKAGE_NAME = os.environ.get("GOOGLE_PLAY_PACKAGE_NAME", "").strip()
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = os.environ.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON", "").strip()

# ----------------------------- feature flags -----------------------------
DEMO_EMAIL = "demo@creatorforge.app"
ADMIN_API_KEY = os.environ.get("ADMIN_API_KEY", "").strip()

# Defaults applied to the current TestFlight/beta build:
# beta premium ON (testers get Premium free), demo account hidden, signups open.
DEFAULT_FLAGS = {
    "beta_premium_enabled": True,
    "demo_account_visible": False,
    "allow_new_signups": True,
}
_FLAGS: dict = dict(DEFAULT_FLAGS)
_FLAGS_TS: float = 0.0
FLAGS_TTL = 10.0  # seconds; picks up DB-side toggles without a restart

MILESTONES = {
    "spark_pack": {
        "title": "Spark Pack Unlocked",
        "desc": "5 ideas captured! Bonus themed templates + a surprise visual style.",
        "reward": "3 bonus generations",
    },
    "forge_badge": {
        "title": "Forge Badge Earned",
        "desc": "First project taken idea to branded assets. Master Creator export unlocked!",
        "reward": "Watermark-free exports + 5 bonus generations",
    },
    "creator_vault": {
        "title": "Creator Vault Unlocked",
        "desc": "10 assets forged! Hidden retro, minimalist & vibrant palettes revealed.",
        "reward": "Exclusive vault themes",
    },
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def today_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


# ----------------------------- models -----------------------------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class GoogleIn(BaseModel):
    session_id: str


class RefineIn(BaseModel):
    raw_idea: str
    mode: str = "plan"


class ProjectIn(BaseModel):
    title: str
    summary: str = ""
    pitch: str = ""
    target_audience: str = ""
    value_prop: str = ""
    tasks: List[str] = []
    brand_keywords: List[str] = []
    source_idea: str = ""


class ProjectPatch(BaseModel):
    title: Optional[str] = None
    summary: Optional[str] = None
    status: Optional[str] = None
    tasks: Optional[list] = None
    brand_kit_id: Optional[str] = None


class RefineProjectIn(BaseModel):
    project_id: str
    message: str


class TaglineIn(BaseModel):
    context: str


class BrandKitIn(BaseModel):
    project_id: Optional[str] = None
    name: Optional[str] = None
    context: str = ""
    auto_generate: bool = True
    colors: Optional[list] = None
    fonts: Optional[dict] = None
    style_rules: Optional[list] = None


class BrandKitPatch(BaseModel):
    name: Optional[str] = None
    colors: Optional[list] = None
    fonts: Optional[dict] = None
    style_rules: Optional[list] = None


class AssetIn(BaseModel):
    prompt: str
    type: str = "social"  # logo | mockup | social | slide | palette
    project_id: Optional[str] = None
    brand_kit_id: Optional[str] = None


class RegenerateIn(BaseModel):
    prompt: Optional[str] = None  # optional tweaked prompt; defaults to original


FREE_DAILY_PACKAGING = 1
PACKAGING_STYLES = {
    "box": "a rigid product box / carton",
    "pouch": "a stand-up flexible pouch",
    "bottle": "a labeled bottle",
    "bag": "a branded shopping/tote bag",
}


class PackagingIn(BaseModel):
    brand_kit_id: str
    style: str = "box"  # box | pouch | bottle | bag
    images: List[str] = []  # 1-2 base64 assets (logo / product image)


class RevertIn(BaseModel):
    version_id: str


class PublishIn(BaseModel):
    public: bool
    alias: Optional[str] = None  # non-personal display name; never email/real name


class ReportIn(BaseModel):
    reason: Optional[str] = None


class CheckoutIn(BaseModel):
    plan: str
    origin_url: str


class IAPVerifyIn(BaseModel):
    platform: str  # "ios" | "android"
    product_id: str
    transaction_id: Optional[str] = None
    purchase_token: Optional[str] = None  # Android
    receipt: Optional[str] = None  # iOS base64 receipt


class FlagsPatch(BaseModel):
    beta_premium_enabled: Optional[bool] = None
    demo_account_visible: Optional[bool] = None
    allow_new_signups: Optional[bool] = None


class AdmtOptOutIn(BaseModel):
    opt_out: bool


# Bump when the ADMT notice text materially changes (forces re-acknowledgement for audit).
ADMT_NOTICE_VERSION = "2026-06"


# ----------------------------- helpers -----------------------------
def public_user(u: dict) -> dict:
    return {k: v for k, v in u.items() if k not in ("password", "_id")}


async def load_flags() -> dict:
    """Read flags from the single app_config doc into the process cache (creates defaults once)."""
    global _FLAGS, _FLAGS_TS
    doc = await db.app_config.find_one({"_id": "feature_flags"})
    if not doc:
        await db.app_config.insert_one({"_id": "feature_flags", "flags": DEFAULT_FLAGS, "updated_at": now_iso()})
        _FLAGS = dict(DEFAULT_FLAGS)
    else:
        f = doc.get("flags", {})
        _FLAGS = {k: bool(f.get(k, DEFAULT_FLAGS[k])) for k in DEFAULT_FLAGS}
    _FLAGS_TS = time.time()
    return _FLAGS


async def ensure_flags_fresh() -> dict:
    """Refresh the cache if older than the TTL so DB-side toggles are respected without a restart."""
    if time.time() - _FLAGS_TS > FLAGS_TTL:
        await load_flags()
    return _FLAGS


async def set_flags(patch: dict, updated_by: str = "admin") -> dict:
    global _FLAGS
    clean = {k: bool(v) for k, v in patch.items() if k in DEFAULT_FLAGS and v is not None}
    if clean:
        update = {f"flags.{k}": v for k, v in clean.items()}
        update["updated_at"] = now_iso()
        update["updated_by"] = updated_by
        await db.app_config.update_one(
            {"_id": "feature_flags"}, {"$set": update, "$setOnInsert": {"_id": "feature_flags"}}, upsert=True
        )
    await load_flags()
    return _FLAGS


def _default_usage():
    return {"date": today_str(), "generations": 0, "exports": 0, "packaging": 0}


async def get_fresh_user(user_id: str) -> dict:
    return await db.users.find_one({"user_id": user_id}, {"_id": 0})


async def ensure_usage_reset(user: dict):
    usage = user.get("usage") or _default_usage()
    if usage.get("date") != today_str():
        usage = _default_usage()
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"usage": usage}})
        user["usage"] = usage
    return usage


def is_premium(user: dict) -> bool:
    # Beta build: when enabled, all authenticated testers get Premium without payment.
    if _FLAGS.get("beta_premium_enabled"):
        return True
    if user.get("plan") == "premium":
        pu = user.get("premium_until")
        if not pu:
            return True
        try:
            return datetime.fromisoformat(pu) > datetime.now(timezone.utc)
        except Exception:
            return True
    return False


async def check_and_count_generation(user: dict):
    await ensure_flags_fresh()
    if is_premium(user):
        return
    usage = await ensure_usage_reset(user)
    allowance = FREE_DAILY_GENERATIONS + user.get("bonus_credits", 0)
    if usage["generations"] >= allowance:
        raise HTTPException(
            status_code=402,
            detail="You've reached today's free generation limit. Upgrade to Premium for unlimited.",
        )
    await db.users.update_one(
        {"user_id": user["user_id"]}, {"$inc": {"usage.generations": 1}}
    )


async def refund_generation(user: dict):
    """Roll back a counted generation when the AI call fails (free tier only)."""
    if is_premium(user):
        return
    await db.users.update_one(
        {"user_id": user["user_id"], "usage.generations": {"$gt": 0}},
        {"$inc": {"usage.generations": -1}},
    )


async def check_and_count_packaging(user: dict):
    """Packaging previews: free tier = 1/day, Premium = unlimited."""
    await ensure_flags_fresh()
    if is_premium(user):
        return
    usage = await ensure_usage_reset(user)
    if usage.get("packaging", 0) >= FREE_DAILY_PACKAGING:
        raise HTTPException(
            status_code=402,
            detail="You've used today's free packaging preview. Upgrade to Premium for unlimited.",
        )
    await db.users.update_one({"user_id": user["user_id"]}, {"$inc": {"usage.packaging": 1}})


async def refund_packaging(user: dict):
    if is_premium(user):
        return
    await db.users.update_one(
        {"user_id": user["user_id"], "usage.packaging": {"$gt": 0}},
        {"$inc": {"usage.packaging": -1}},
    )


async def update_streak(user_id: str):
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0, "streak": 1})
    streak = (u or {}).get("streak") or {"count": 0, "last_date": None}
    today = today_str()
    if streak.get("last_date") == today:
        return {"count": streak.get("count", 0), "extended": False, "is_milestone": False}
    yest = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
    streak["count"] = streak.get("count", 0) + 1 if streak.get("last_date") == yest else 1
    streak["last_date"] = today
    await db.users.update_one({"user_id": user_id}, {"$set": {"streak": streak}})
    return {
        "count": streak["count"],
        "extended": True,
        "is_milestone": streak["count"] in (3, 7, 14, 30, 60, 100),
    }


SURPRISE_REWARDS = [
    {"type": "credit", "title": "Surprise Credit!", "desc": "The forge smiled on you — a bonus AI generation is yours.", "reward": "+1 generation"},
    {"type": "style", "title": "Hidden Style Unlocked", "desc": "A fresh surprise visual style just dropped into your vault.", "reward": "Surprise style"},
    {"type": "boost", "title": "Lucky Spark", "desc": "You struck gold! Enjoy an extra bonus credit on us.", "reward": "+1 generation"},
    {"type": "praise", "title": "On a Roll", "desc": "Your creative momentum is inspiring — keep forging!", "reward": "Creator kudos"},
]


async def maybe_surprise(user_id: str):
    """Variable reward (Hooked model): occasional delightful surprise, capped 2/day."""
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0, "surprise_day": 1})
    today = today_str()
    sd = (u or {}).get("surprise_day") or {"date": today, "count": 0}
    if sd.get("date") != today:
        sd = {"date": today, "count": 0}
    if sd["count"] >= 2:
        return None
    if random.random() < 0.25:
        choice = random.choice(SURPRISE_REWARDS)
        inc = 1 if choice["type"] in ("credit", "boost") else 0
        sd["count"] += 1
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"surprise_day": sd}, "$inc": {"bonus_credits": inc}},
        )
        return choice
    await db.users.update_one({"user_id": user_id}, {"$set": {"surprise_day": sd}})
    return None


def memory_context(user: dict) -> str:
    """Build a concise Smart Brand Memory prompt fragment (empty if disabled/empty)."""
    # ADMT (CCPA) opt-out: do not use the consumer's data to personalize/profile outputs.
    if user.get("admt_opt_out"):
        return ""
    mem = user.get("brand_memory") or {}
    if not mem.get("enabled", True):
        return ""
    parts = []
    if mem.get("tone"):
        parts.append(f"tone: {mem['tone']}")
    if mem.get("keywords"):
        parts.append("keywords: " + ", ".join(mem["keywords"][:6]))
    if mem.get("colors"):
        parts.append("signature colors: " + ", ".join(mem["colors"][:5]))
    if not parts:
        return ""
    return "User's established brand style — " + "; ".join(parts) + "."


async def learn_brand_memory(user_id: str, keywords=None, colors=None, tone=None):
    """Aggregate style signals into the user's Smart Brand Memory (most-recent-first, capped)."""
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0, "brand_memory": 1, "admt_opt_out": 1})
    # Respect ADMT opt-out: never store the consumer's data for personalization/profiling.
    if (u or {}).get("admt_opt_out"):
        return (u or {}).get("brand_memory") or {"enabled": False, "tone": "", "keywords": [], "colors": []}
    mem = (u or {}).get("brand_memory") or {"enabled": True, "tone": "", "keywords": [], "colors": []}

    def merge(existing, incoming, cap):
        out = list(existing or [])
        for item in incoming or []:
            if not item:
                continue
            norm = item.strip()
            low = [x.lower() for x in out]
            if norm.lower() in low:
                out.pop(low.index(norm.lower()))
            out.insert(0, norm)  # most recent first
        return out[:cap]

    mem["keywords"] = merge(mem.get("keywords"), keywords, 12)
    mem["colors"] = merge(mem.get("colors"), colors, 8)
    if tone:
        mem["tone"] = tone
    await db.users.update_one({"user_id": user_id}, {"$set": {"brand_memory": mem}})
    return mem


async def recompute_milestones(user_id: str) -> list:
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    counters = u.get("counters", {})
    streak = (u.get("streak") or {}).get("count", 0)
    unlocked = set(u.get("unlocked", []))
    newly = []

    def unlock(key):
        if key not in unlocked:
            unlocked.add(key)
            newly.append(key)

    if counters.get("ideas_created", 0) >= 5:
        unlock("spark_pack")
    if counters.get("projects_completed", 0) >= 1:
        unlock("forge_badge")
    if counters.get("assets_created", 0) >= 10:
        unlock("creator_vault")
    if streak >= 7:
        unlock("streak_week")

    if newly:
        await db.users.update_one({"user_id": user_id}, {"$set": {"unlocked": list(unlocked)}})
    return newly


# ----------------------------- auth -----------------------------