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
    if counters.get("assets_generated", 0) >= 10 or streak >= 7:
        unlock("creator_vault")

    if newly:
        bonus_add = 0
        if "spark_pack" in newly:
            bonus_add += 3
        if "forge_badge" in newly:
            bonus_add += 5
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"unlocked": list(unlocked)}, "$inc": {"bonus_credits": bonus_add}},
        )
    return newly


# ----------------------------- auth routes -----------------------------
def _new_user_doc(user_id, email, name, picture="", password=None):
    return {
        "user_id": user_id,
        "email": email.lower(),
        "name": name,
        "picture": picture,
        "password": password,
        "plan": "free",
        "premium_until": None,
        "usage": _default_usage(),
        "counters": {"ideas_created": 0, "assets_generated": 0, "projects_completed": 0},
        "streak": {"count": 0, "last_date": None},
        "unlocked": [],
        "bonus_credits": 0,
        "theme": "dark",
        "brand_memory": {"enabled": True, "tone": "", "keywords": [], "colors": []},
        "beta_premium": bool(_FLAGS.get("beta_premium_enabled")),
        "admt_opt_out": False,
        "created_at": now_iso(),
    }


@api.post("/auth/register")
async def register(body: RegisterIn):
    await ensure_flags_fresh()
    if not _FLAGS.get("allow_new_signups"):
        raise HTTPException(status_code=403, detail="New sign-ups are currently closed.")
    if await db.users.find_one({"email": body.email.lower()}):
        raise HTTPException(status_code=409, detail="Email already registered")
    uid = auth.new_user_id()
    doc = _new_user_doc(uid, body.email, body.name, password=auth.hash_password(body.password))
    await db.users.insert_one(doc)
    return {"token": auth.make_jwt(uid), "user": public_user(doc)}


@api.post("/auth/login")
async def login(body: LoginIn):
    await ensure_flags_fresh()
    u = await db.users.find_one({"email": body.email.lower()})
    # Hide the demo account when disabled — keep the error generic to avoid enumeration.
    if body.email.lower() == DEMO_EMAIL and not _FLAGS.get("demo_account_visible"):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not u or not u.get("password") or not auth.verify_password(body.password, u["password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return {"token": auth.make_jwt(u["user_id"]), "user": public_user(u)}


@api.post("/auth/google")
async def google_auth(body: GoogleIn):
    await ensure_flags_fresh()
    try:
        data = await auth.fetch_emergent_session(body.session_id)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Google session")
    email = data["email"].lower()
    u = await db.users.find_one({"email": email})
    if not u:
        if not _FLAGS.get("allow_new_signups"):
            raise HTTPException(status_code=403, detail="New sign-ups are currently closed.")
        uid = auth.new_user_id()
        u = _new_user_doc(uid, email, data.get("name", email.split("@")[0]), data.get("picture", ""))
        await db.users.insert_one(u)
    session_token = data["session_token"]
    await db.user_sessions.update_one(
        {"session_token": session_token},
        {"$set": {
            "session_token": session_token,
            "user_id": u["user_id"],
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
            "created_at": now_iso(),
        }},
        upsert=True,
    )
    return {"token": session_token, "user": public_user(u)}


@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return {"user": public_user(user)}


@api.post("/auth/logout")
async def logout(request: Request, user=Depends(get_current_user)):
    authz = request.headers.get("authorization", "")
    if authz.startswith("Bearer "):
        await db.user_sessions.delete_one({"session_token": authz.split(" ", 1)[1]})
    return {"ok": True}


# ----------------------------- feature flags (config + admin) -----------------------------
@api.get("/config/flags")
async def public_flags():
    """Public, non-sensitive booleans the app reads to gate UI (demo visibility, signups)."""
    await load_flags()
    return {
        "beta_premium_enabled": _FLAGS["beta_premium_enabled"],
        "demo_account_visible": _FLAGS["demo_account_visible"],
        "allow_new_signups": _FLAGS["allow_new_signups"],
    }


def _require_admin_key(x_admin_key: Optional[str]):
    if not ADMIN_API_KEY or x_admin_key != ADMIN_API_KEY:
        raise HTTPException(status_code=403, detail="Admin access required")


@api.get("/admin/feature-flags")
async def admin_get_flags(x_admin_key: Optional[str] = Header(None)):
    _require_admin_key(x_admin_key)
    await load_flags()
    return {"flags": _FLAGS}


@api.patch("/admin/feature-flags")
async def admin_set_flags(body: FlagsPatch, x_admin_key: Optional[str] = Header(None)):
    _require_admin_key(x_admin_key)
    flags = await set_flags(body.model_dump(exclude_none=True), updated_by="admin")
    logger.info(f"Feature flags updated: {body.model_dump(exclude_none=True)}")
    return {"flags": flags}


# ----------------------------- ADMT / automated decision transparency (CCPA) -----------------------------
ADMT_DISCLOSURE = {
    "uses_admt": True,
    "purpose": (
        "CreatorForge uses automated decisionmaking technology (AI models) solely to help you "
        "create brand content — turning the ideas, text, and voice you submit into brand plans, "
        "color palettes, taglines, logos, and images. It is not used to make legal, financial, "
        "employment, housing, credit, insurance, healthcare, or education decisions about you."
    ),
    "models": ["Anthropic Claude (text)", "Google Gemini (images)", "OpenAI Whisper (voice-to-text)"],
    "data_categories": [
        "Ideas and descriptions you type",
        "Voice recordings you choose to submit (transcribed to text)",
        "Style preferences you save (Smart Brand Memory)",
    ],
    "key_factors": [
        "The words and intent in your prompt",
        "The asset type you request (logo, social, mockup, etc.)",
        "Your saved brand style, only if personalization is ON",
    ],
    "output_types": ["Text (plans, taglines, summaries)", "Images (logos, social graphics, mockups)", "Color palettes"],
    "how_output_is_used": (
        "Outputs are presented to you as editable suggestions. You decide what to keep, refine, "
        "regenerate, export, or delete — the technology does not take any consequential action on its own."
    ),
    "human_involvement": (
        "You remain in control at every step: all AI output is optional, reviewable, and editable by you, "
        "and nothing is finalized without your action."
    ),
    "no_retaliation": (
        "We will not discriminate or retaliate against you for exercising your privacy rights, including "
        "opting out of automated personalization."
    ),
    "opt_out_effect": (
        "If you opt out, AI creation tools stay available, but we will not use your data to profile or "
        "personalize outputs (Smart Brand Memory is turned off and no style data is stored)."
    ),
    "alternatives": [
        "Manual tools remain available: the palette generator, templates, manual brand-kit editing, and exports.",
    ],
    "opt_out_methods": [
        "In-app: Profile → Privacy & Automated Decisions → toggle off automated personalization",
        "Email: privacy@creatorforge.app",
    ],
}


@api.get("/privacy/admt")
async def admt_info(user=Depends(get_current_user)):
    """Right-to-access: disclose how ADMT works + the consumer's current opt-out/ack status."""
    u = await get_fresh_user(user["user_id"])
    return {
        **ADMT_DISCLOSURE,
        "opted_out": bool(u.get("admt_opt_out")),
        "opted_out_at": u.get("admt_opt_out_at"),
        "notice_version": ADMT_NOTICE_VERSION,
        "acknowledged": u.get("admt_notice_ack_version") == ADMT_NOTICE_VERSION,
        "acknowledged_at": u.get("admt_notice_ack_at"),
    }


@api.post("/privacy/admt-ack")
async def admt_ack(user=Depends(get_current_user)):
    """Record that the pre-use ADMT notice was presented and acknowledged (auditable, timestamped)."""
    ts = now_iso()
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"admt_notice_ack_version": ADMT_NOTICE_VERSION, "admt_notice_ack_at": ts}},
    )
    return {"acknowledged": True, "acknowledged_at": ts, "notice_version": ADMT_NOTICE_VERSION}


@api.post("/privacy/admt-optout")
async def admt_optout(body: AdmtOptOutIn, user=Depends(get_current_user)):
    """Opt in/out of automated personalization (ADMT). Disables/enables Smart Brand Memory use."""
    update = {"admt_opt_out": bool(body.opt_out)}
    if body.opt_out:
        update["admt_opt_out_at"] = now_iso()
        update["brand_memory.enabled"] = False  # stop personalization immediately
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": update})
    u = await get_fresh_user(user["user_id"])
    return {"opted_out": bool(u.get("admt_opt_out")), "opted_out_at": u.get("admt_opt_out_at")}


@api.delete("/auth/account")
async def delete_account(user=Depends(get_current_user)):
    """GDPR/CCPA erasure — permanently delete the user and all associated data."""
    uid = user["user_id"]
    await db.projects.delete_many({"user_id": uid})
    await db.brand_kits.delete_many({"user_id": uid})
    await db.assets.delete_many({"user_id": uid})
    await db.payment_transactions.delete_many({"user_id": uid})
    await db.user_sessions.delete_many({"user_id": uid})
    await db.users.delete_one({"user_id": uid})
    return {"ok": True}


@api.patch("/auth/theme")
async def set_theme(body: dict, user=Depends(get_current_user)):
    theme = body.get("theme", "dark")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"theme": theme}})
    return {"ok": True, "theme": theme}


@api.get("/brand-memory")
async def get_brand_memory(user=Depends(get_current_user)):
    mem = user.get("brand_memory") or {"enabled": True, "tone": "", "keywords": [], "colors": []}
    return {"brand_memory": mem}


@api.patch("/brand-memory")
async def patch_brand_memory(body: dict, user=Depends(get_current_user)):
    mem = user.get("brand_memory") or {"enabled": True, "tone": "", "keywords": [], "colors": []}
    if "enabled" in body:
        mem["enabled"] = bool(body["enabled"])
    if "tone" in body:
        mem["tone"] = str(body["tone"])[:60]
    if "keywords" in body and isinstance(body["keywords"], list):
        mem["keywords"] = [str(k).strip() for k in body["keywords"] if str(k).strip()][:12]
    if "colors" in body and isinstance(body["colors"], list):
        mem["colors"] = [str(x).strip() for x in body["colors"] if str(x).strip()][:8]
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"brand_memory": mem}})
    return {"brand_memory": mem}


# ----------------------------- AI routes -----------------------------
@api.post("/ai/refine")
async def ai_refine(body: RefineIn, user=Depends(get_current_user)):
    return await ai.refine_idea(user["user_id"], body.raw_idea, body.mode, memory_context(user))


@api.post("/ai/refine-project")
async def ai_refine_project(body: RefineProjectIn, user=Depends(get_current_user)):
    p = await db.projects.find_one({"id": body.project_id, "user_id": user["user_id"]}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Project not found")
    context = f"Title: {p.get('title')}\nSummary: {p.get('summary')}\nPitch: {p.get('pitch')}"
    reply = await ai.chat_refine(user["user_id"], context, body.message)
    entry_u = {"role": "user", "text": body.message, "at": now_iso()}
    entry_a = {"role": "assistant", "text": reply, "at": now_iso()}
    await db.projects.update_one(
        {"id": body.project_id},
        {"$push": {"refinements": {"$each": [entry_u, entry_a]}}, "$set": {"updated_at": now_iso()}},
    )
    return {"reply": reply}


@api.post("/ai/taglines")
async def ai_taglines(body: TaglineIn, user=Depends(get_current_user)):
    return {"taglines": await ai.generate_taglines(user["user_id"], body.context, memory_context(user))}


@api.post("/voice/transcribe")
async def voice_transcribe(file: UploadFile = File(...), user=Depends(get_current_user)):
    suffix = os.path.splitext(file.filename or "audio.m4a")[1] or ".m4a"
    if suffix.lstrip(".").lower() not in ["mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm"]:
        suffix = ".m4a"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        tmp.write(await file.read())
        tmp.close()
        text = await ai.transcribe_audio(tmp.name)
    finally:
        try:
            os.unlink(tmp.name)
        except Exception:
            pass
    return {"text": text}


# ----------------------------- projects -----------------------------
@api.post("/projects")
async def create_project(body: ProjectIn, user=Depends(get_current_user)):
    pid = str(uuid.uuid4())
    doc = {
        "id": pid,
        "user_id": user["user_id"],
        "title": body.title or "Untitled Project",
        "summary": body.summary,
        "pitch": body.pitch,
        "target_audience": body.target_audience,
        "value_prop": body.value_prop,
        "brand_keywords": body.brand_keywords,
        "source_idea": body.source_idea,
        "status": "idea",
        "tasks": [{"id": str(uuid.uuid4()), "text": t, "done": False} for t in body.tasks],
        "brand_kit_id": None,
        "refinements": [],
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.projects.insert_one(doc)
    await db.users.update_one({"user_id": user["user_id"]}, {"$inc": {"counters.ideas_created": 1}})
    await learn_brand_memory(user["user_id"], keywords=body.brand_keywords)
    streak_event = await update_streak(user["user_id"])
    newly = await recompute_milestones(user["user_id"])
    doc.pop("_id", None)
    return {"project": doc, "newly_unlocked": newly, "streak_event": streak_event}


@api.get("/projects")
async def list_projects(q: str = "", status: str = "", user=Depends(get_current_user)):
    query = {"user_id": user["user_id"]}
    if status:
        query["status"] = status
    if q:
        query["$or"] = [
            {"title": {"$regex": q, "$options": "i"}},
            {"summary": {"$regex": q, "$options": "i"}},
        ]
    items = await db.projects.find(query, {"_id": 0}).sort("updated_at", -1).to_list(200)
    return {"projects": items}


@api.get("/projects/{pid}")
async def get_project(pid: str, user=Depends(get_current_user)):
    p = await require_owner(db, "projects", pid, user)
    assets = await db.assets.find({"project_id": pid}, {"_id": 0, "image_b64": 0}).to_list(100)
    kit = None
    if p.get("brand_kit_id"):
        kit = await db.brand_kits.find_one({"id": p["brand_kit_id"]}, {"_id": 0})
    return {"project": p, "assets": assets, "brand_kit": kit}


@api.patch("/projects/{pid}")
async def patch_project(pid: str, body: ProjectPatch, user=Depends(get_current_user)):
    p = await require_owner(db, "projects", pid, user)
    update = {k: v for k, v in body.dict().items() if v is not None}
    update["updated_at"] = now_iso()
    await db.projects.update_one({"id": pid}, {"$set": update})
    newly = []
    if update.get("status") == "done":
        asset_count = await db.assets.count_documents({"project_id": pid})
        merged = {**p, **update}
        if merged.get("brand_kit_id") and asset_count >= 1:
            await db.users.update_one(
                {"user_id": user["user_id"]}, {"$inc": {"counters.projects_completed": 1}}
            )
            newly = await recompute_milestones(user["user_id"])
    updated = await db.projects.find_one({"id": pid}, {"_id": 0})
    return {"project": updated, "newly_unlocked": newly}


@api.delete("/projects/{pid}")
async def delete_project(pid: str, user=Depends(get_current_user)):
    await require_owner(db, "projects", pid, user)
    await db.projects.delete_one({"id": pid})
    await db.assets.delete_many({"project_id": pid})
    return {"ok": True}


# ----------------------------- brand kits -----------------------------
@api.post("/brand-kits")
async def create_brand_kit(body: BrandKitIn, user=Depends(get_current_user)):
    context = body.context
    if body.project_id and not context:
        p = await db.projects.find_one({"id": body.project_id}, {"_id": 0})
        if p:
            context = f"{p.get('title')}. {p.get('summary')} Keywords: {', '.join(p.get('brand_keywords', []))}"
    palette = {
        "name": body.name or "New Brand Kit",
        "colors": body.colors or ["#C5A880", "#1C1C1C", "#EAEAEA", "#0F0F0F", "#A3865D"],
        "fonts": body.fonts or {"heading": "Fraunces", "body": "Geist"},
        "style_rules": body.style_rules or ["Keep it minimal", "Lead with the hero", "High contrast"],
    }
    if body.auto_generate:
        await check_and_count_generation(user)
        palette = await ai.generate_palette(user["user_id"], context or (body.name or "modern brand"), memory_context(user))
        if body.name:
            palette["name"] = body.name
    kid = str(uuid.uuid4())
    doc = {
        "id": kid,
        "user_id": user["user_id"],
        "project_id": body.project_id,
        "name": palette.get("name", "Brand Kit"),
        "colors": palette.get("colors", []),
        "fonts": palette.get("fonts", {}),
        "style_rules": palette.get("style_rules", []),
        "logo": None,
        "created_at": now_iso(),
    }
    await db.brand_kits.insert_one(doc)
    await learn_brand_memory(
        user["user_id"],
        keywords=doc.get("style_rules", []),
        colors=doc.get("colors", []),
    )
    if body.project_id:
        await db.projects.update_one(
            {"id": body.project_id, "user_id": user["user_id"]},
            {"$set": {"brand_kit_id": kid, "status": "branding", "updated_at": now_iso()}},
        )
    doc.pop("_id", None)
    return {"brand_kit": doc}


@api.get("/brand-kits")
async def list_brand_kits(user=Depends(get_current_user)):
    items = await db.brand_kits.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"brand_kits": items}


@api.get("/brand-kits/{kid}")
async def get_brand_kit(kid: str, user=Depends(get_current_user)):
    k = await require_owner(db, "brand_kits", kid, user)
    assets = await db.assets.find({"brand_kit_id": kid}, {"_id": 0, "image_b64": 0}).to_list(100)
    return {"brand_kit": k, "assets": assets}


@api.patch("/brand-kits/{kid}")
async def patch_brand_kit(kid: str, body: BrandKitPatch, user=Depends(get_current_user)):
    await require_owner(db, "brand_kits", kid, user)
    update = {k: v for k, v in body.dict().items() if v is not None}
    if not update:
        raise HTTPException(400, "Nothing to update")
    await db.brand_kits.update_one({"id": kid}, {"$set": update})
    return {"brand_kit": await db.brand_kits.find_one({"id": kid}, {"_id": 0})}


@api.delete("/brand-kits/{kid}")
async def delete_brand_kit(kid: str, user=Depends(get_current_user)):
    await require_owner(db, "brand_kits", kid, user)
    await db.brand_kits.delete_one({"id": kid})
    return {"ok": True}


@api.post("/brand-kits/{kid}/logo")
async def generate_logo(kid: str, user=Depends(get_current_user)):
    k = await db.brand_kits.find_one({"id": kid, "user_id": user["user_id"]}, {"_id": 0})
    if not k:
        raise HTTPException(404, "Brand kit not found")
    await check_and_count_generation(user)
    prompt = (
        f"A clean, modern, professional vector-style logo for a brand called '{k['name']}'. "
        f"Brand style: {', '.join(k.get('style_rules', []))}. "
        f"Use these brand colors: {', '.join(k.get('colors', [])[:3])}. "
        f"Minimal, iconic, on a solid flat background, high contrast, centered."
    )
    b64 = await ai.generate_image(user["user_id"], prompt, memory_context(user))
    if not b64:
        await refund_generation(user)
        raise HTTPException(502, "Image generation failed, please try again")
    await db.brand_kits.update_one({"id": kid}, {"$set": {"logo": b64}})
    return {"logo": b64}


# ----------------------------- social gallery (opt-in, privacy-first) -----------------------------
GALLERY_REPORT_THRESHOLD = 3


def public_gallery_kit(k: dict) -> dict:
    """Expose ONLY non-personal, safe fields for the public gallery. Never user id/email/name."""
    return {
        "id": k.get("id"),
        "name": k.get("name"),
        "colors": k.get("colors", []),
        "fonts": k.get("fonts", {}),
        "style_rules": k.get("style_rules", []),
        "logo": k.get("logo"),
        "alias": k.get("gallery_alias") or "A CreatorForge maker",
        "remix_count": k.get("remix_count", 0),
        "published_at": k.get("published_at"),
    }


@api.post("/brand-kits/{kid}/publish")
async def publish_brand_kit(kid: str, body: PublishIn, user=Depends(get_current_user)):
    """Explicit opt-in publish/unpublish of a brand kit to the community gallery."""
    k = await db.brand_kits.find_one({"id": kid, "user_id": user["user_id"]}, {"_id": 0})
    if not k:
        raise HTTPException(404, "Brand kit not found")
    update: dict = {"is_public": bool(body.public), "updated_at": now_iso()}
    if body.public:
        alias = (body.alias or "").strip()[:40]
        update["gallery_alias"] = alias or "A CreatorForge maker"
        update["published_at"] = now_iso()
    await db.brand_kits.update_one({"id": kid}, {"$set": update})
    fresh = await db.brand_kits.find_one({"id": kid}, {"_id": 0})
    return {"brand_kit": fresh}


@api.get("/gallery")
async def gallery(limit: int = 40):
    """Public, opt-in gallery feed. Returns only non-personal brand fields + a trending row."""
    q = {"is_public": True, "$or": [{"reports": {"$exists": False}}, {"reports": {"$lt": GALLERY_REPORT_THRESHOLD}}]}
    items = await db.brand_kits.find(q, {"_id": 0}).sort("published_at", -1).to_list(min(limit, 100))
    # Trending: most-remixed public kits (viral loop). Zero extra cost.
    trending_raw = await db.brand_kits.find({**q, "remix_count": {"$gte": 1}}, {"_id": 0}).sort("remix_count", -1).to_list(8)
    return {
        "items": [public_gallery_kit(k) for k in items],
        "trending": [public_gallery_kit(k) for k in trending_raw],
    }


@api.post("/gallery/{kid}/remix")
async def remix_brand_kit(kid: str, user=Depends(get_current_user)):
    """Clone a published kit's palette/fonts/style as a starting point (no logo/assets/personal data)."""
    src = await db.brand_kits.find_one({"id": kid, "is_public": True}, {"_id": 0})
    if not src:
        raise HTTPException(404, "Gallery item not found")
    nid = str(uuid.uuid4())
    doc = {
        "id": nid,
        "user_id": user["user_id"],
        "project_id": None,
        "name": f"{src.get('name', 'Brand')} (remix)",
        "colors": src.get("colors", []),
        "fonts": src.get("fonts", {}),
        "style_rules": src.get("style_rules", []),
        "logo": None,
        "remixed_from": kid,
        "created_at": now_iso(),
    }
    await db.brand_kits.insert_one(doc)
    await db.brand_kits.update_one({"id": kid}, {"$inc": {"remix_count": 1}})
    await learn_brand_memory(user["user_id"], keywords=doc.get("style_rules", []), colors=doc.get("colors", []))
    doc.pop("_id", None)
    return {"brand_kit": doc}


@api.post("/gallery/{kid}/report")
async def report_brand_kit(kid: str, body: ReportIn, user=Depends(get_current_user)):
    """Community moderation: report inappropriate content; auto-unpublish past a threshold."""
    k = await db.brand_kits.find_one({"id": kid, "is_public": True}, {"_id": 0, "id": 1, "reports": 1})
    if k is None:
        raise HTTPException(404, "Gallery item not found")
    reports = (k.get("reports", 0) or 0) + 1
    update: dict = {"reports": reports}
    if reports >= GALLERY_REPORT_THRESHOLD:
        update["is_public"] = False  # auto-hide pending review
    await db.brand_kits.update_one({"id": kid}, {"$set": update})
    return {"ok": True, "reports": reports, "hidden": reports >= GALLERY_REPORT_THRESHOLD}



# ----------------------------- assets -----------------------------
ASSET_PROMPTS = {
    "logo": "a professional minimal logo",
    "mockup": "a realistic product packaging mockup",
    "social": "an eye-catching social media graphic (square)",
    "slide": "a clean pitch deck title slide",
}


@api.post("/assets/generate")
async def generate_asset(body: AssetIn, user=Depends(get_current_user)):
    await check_and_count_generation(user)
    style = ""
    if body.brand_kit_id:
        k = await db.brand_kits.find_one({"id": body.brand_kit_id}, {"_id": 0})
        if k:
            style = (
                f" On-brand for '{k['name']}': colors {', '.join(k.get('colors', [])[:4])}; "
                f"style {', '.join(k.get('style_rules', []))}."
            )
    base = ASSET_PROMPTS.get(body.type, "a branded visual asset")
    full_prompt = f"Create {base}. {body.prompt}.{style} Professional, high quality, polished."
    b64 = await ai.generate_image(user["user_id"], full_prompt, memory_context(user))
    if not b64:
        await refund_generation(user)
        raise HTTPException(502, "Image generation failed, please try again")
    aid = str(uuid.uuid4())
    doc = {
        "id": aid,
        "user_id": user["user_id"],
        "project_id": body.project_id,
        "brand_kit_id": body.brand_kit_id,
        "type": body.type,
        "prompt": body.prompt,
        "image_b64": b64,
        "watermarked": not is_premium(user),
        "created_at": now_iso(),
    }
    await db.assets.insert_one(doc)
    await db.users.update_one(
        {"user_id": user["user_id"]}, {"$inc": {"counters.assets_generated": 1}}
    )
    streak_event = await update_streak(user["user_id"])
    newly = await recompute_milestones(user["user_id"])
    surprise = await maybe_surprise(user["user_id"])
    doc.pop("_id", None)
    return {"asset": doc, "newly_unlocked": newly, "streak_event": streak_event, "surprise": surprise}


@api.post("/assets/packaging")
async def generate_packaging(body: PackagingIn, user=Depends(get_current_user)):
    """AI product-packaging mockup from 1–2 uploaded assets + brand kit colors/fonts."""
    if not body.images:
        raise HTTPException(400, "Upload a logo or product image first")
    k = await db.brand_kits.find_one({"id": body.brand_kit_id, "user_id": user["user_id"]}, {"_id": 0})
    if not k:
        raise HTTPException(404, "Brand kit not found")
    style_key = body.style if body.style in PACKAGING_STYLES else "box"
    await check_and_count_packaging(user)

    fonts = k.get("fonts") or {}
    font_str = ", ".join([str(v) for v in fonts.values()][:2]) if isinstance(fonts, dict) else ""
    prompt = (
        f"Create a single, clean, photorealistic product packaging mockup: {PACKAGING_STYLES[style_key]}. "
        f"Prominently and accurately apply the provided brand asset (logo/product image) onto the packaging. "
        f"Use the brand colors {', '.join(k.get('colors', [])[:4])}"
        + (f" and typography style ({font_str})" if font_str else "")
        + f". Brand: '{k.get('name', '')}'. Style cues: {', '.join(k.get('style_rules', [])[:4])}. "
        f"One product, centered, studio lighting, neutral background, front view only. "
        f"No text other than the brand's own marks. Professional, high quality."
    )
    b64 = await ai.generate_image(user["user_id"], prompt, memory_context(user), images=body.images[:2])
    if not b64:
        await refund_packaging(user)
        raise HTTPException(502, "Packaging generation failed, please try again")

    aid = str(uuid.uuid4())
    doc = {
        "id": aid,
        "user_id": user["user_id"],
        "project_id": k.get("project_id"),
        "brand_kit_id": body.brand_kit_id,
        "type": "packaging",
        "prompt": f"{style_key} packaging mockup",
        "image_b64": b64,
        "watermarked": not is_premium(user),
        "created_at": now_iso(),
    }
    await db.assets.insert_one(doc)
    await db.users.update_one({"user_id": user["user_id"]}, {"$inc": {"counters.assets_generated": 1}})
    streak_event = await update_streak(user["user_id"])
    newly = await recompute_milestones(user["user_id"])
    surprise = await maybe_surprise(user["user_id"])
    doc.pop("_id", None)
    return {"asset": doc, "newly_unlocked": newly, "streak_event": streak_event, "surprise": surprise}



@api.get("/assets")
async def list_assets(project_id: str = "", brand_kit_id: str = "", user=Depends(get_current_user)):
    query = {"user_id": user["user_id"]}
    if project_id:
        query["project_id"] = project_id
    if brand_kit_id:
        query["brand_kit_id"] = brand_kit_id
    items = await db.assets.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"assets": items}


@api.get("/assets/{aid}")
async def get_asset(aid: str, user=Depends(get_current_user)):
    a = await require_owner(db, "assets", aid, user)
    return {"asset": a}


@api.delete("/assets/{aid}")
async def delete_asset(aid: str, user=Depends(get_current_user)):
    await require_owner(db, "assets", aid, user)
    await db.assets.delete_one({"id": aid})
    return {"ok": True}


MAX_ASSET_VERSIONS = 10


def _build_asset_prompt(asset: dict, override_prompt: str = ""):
    base = ASSET_PROMPTS.get(asset.get("type", ""), "a branded visual asset")
    prompt = override_prompt or asset.get("prompt", "")
    return base, prompt


@api.get("/assets/{aid}/versions")
async def asset_versions(aid: str, user=Depends(get_current_user)):
    a = await db.assets.find_one({"id": aid, "user_id": user["user_id"]}, {"_id": 0})
    if not a:
        raise HTTPException(404, "Asset not found")
    current = {
        "id": "current",
        "image_b64": a.get("image_b64"),
        "prompt": a.get("prompt"),
        "created_at": a.get("updated_at") or a.get("created_at"),
        "watermarked": a.get("watermarked", False),
    }
    return {"asset_id": aid, "type": a.get("type"), "current": current, "versions": a.get("versions", [])}


@api.post("/assets/{aid}/regenerate")
async def regenerate_asset(aid: str, body: RegenerateIn, user=Depends(get_current_user)):
    a = await db.assets.find_one({"id": aid, "user_id": user["user_id"]}, {"_id": 0})
    if not a:
        raise HTTPException(404, "Asset not found")
    await check_and_count_generation(user)
    style = ""
    if a.get("brand_kit_id"):
        k = await db.brand_kits.find_one({"id": a["brand_kit_id"]}, {"_id": 0})
        if k:
            style = (
                f" On-brand for '{k['name']}': colors {', '.join(k.get('colors', [])[:4])}; "
                f"style {', '.join(k.get('style_rules', []))}."
            )
    base, prompt = _build_asset_prompt(a, body.prompt or "")
    full_prompt = f"Create {base}. {prompt}.{style} Professional, high quality, polished."
    b64 = await ai.generate_image(user["user_id"], full_prompt, memory_context(user))
    if not b64:
        await refund_generation(user)
        raise HTTPException(502, "Image generation failed, please try again")

    # push the outgoing current image into version history (most-recent-first, capped)
    prev = {
        "id": str(uuid.uuid4()),
        "image_b64": a.get("image_b64"),
        "prompt": a.get("prompt"),
        "created_at": a.get("updated_at") or a.get("created_at"),
        "watermarked": a.get("watermarked", False),
    }
    versions = ([prev] + (a.get("versions") or []))[:MAX_ASSET_VERSIONS]
    watermarked = not is_premium(user)
    await db.assets.update_one(
        {"id": aid},
        {"$set": {
            "image_b64": b64,
            "prompt": prompt,
            "watermarked": watermarked,
            "versions": versions,
            "updated_at": now_iso(),
        }},
    )
    await db.users.update_one({"user_id": user["user_id"]}, {"$inc": {"counters.assets_generated": 1}})
    streak_event = await update_streak(user["user_id"])
    newly = await recompute_milestones(user["user_id"])
    surprise = await maybe_surprise(user["user_id"])
    fresh = await db.assets.find_one({"id": aid}, {"_id": 0})
    return {"asset": fresh, "newly_unlocked": newly, "streak_event": streak_event, "surprise": surprise}


@api.post("/assets/{aid}/revert")
async def revert_asset(aid: str, body: RevertIn, user=Depends(get_current_user)):
    """Restore a previous version as current (no generation cost)."""
    a = await db.assets.find_one({"id": aid, "user_id": user["user_id"]}, {"_id": 0})
    if not a:
        raise HTTPException(404, "Asset not found")
    versions = a.get("versions") or []
    target = next((v for v in versions if v.get("id") == body.version_id), None)
    if not target:
        raise HTTPException(404, "Version not found")
    remaining = [v for v in versions if v.get("id") != body.version_id]
    outgoing = {
        "id": str(uuid.uuid4()),
        "image_b64": a.get("image_b64"),
        "prompt": a.get("prompt"),
        "created_at": a.get("updated_at") or a.get("created_at"),
        "watermarked": a.get("watermarked", False),
    }
    new_versions = ([outgoing] + remaining)[:MAX_ASSET_VERSIONS]
    await db.assets.update_one(
        {"id": aid},
        {"$set": {
            "image_b64": target.get("image_b64"),
            "prompt": target.get("prompt"),
            "watermarked": target.get("watermarked", False),
            "versions": new_versions,
            "updated_at": now_iso(),
        }},
    )
    fresh = await db.assets.find_one({"id": aid}, {"_id": 0})
    return {"asset": fresh}


# ----------------------------- usage / milestones -----------------------------
@api.get("/usage")
async def get_usage(user=Depends(get_current_user)):
    await ensure_flags_fresh()
    u = await get_fresh_user(user["user_id"])
    usage = await ensure_usage_reset(u)
    premium = is_premium(u)
    allowance = FREE_DAILY_GENERATIONS + u.get("bonus_credits", 0)
    return {
        "plan": "premium" if premium else "free",
        "premium_until": u.get("premium_until"),
        "generations_used": usage["generations"],
        "generations_limit": None if premium else allowance,
        "bonus_credits": u.get("bonus_credits", 0),
        "counters": u.get("counters", {}),
        "streak": u.get("streak", {}),
        "unlocked": u.get("unlocked", []),
        "milestones": MILESTONES,
    }


# ----------------------------- payments -----------------------------
@api.get("/payments/packages")
async def payment_packages():
    return {"packages": PACKAGES}


@api.post("/payments/checkout")
async def create_checkout(body: CheckoutIn, request: Request, user=Depends(get_current_user)):
    if body.plan not in PACKAGES:
        raise HTTPException(400, "Invalid plan")
    pkg = PACKAGES[body.plan]
    origin = body.origin_url.rstrip("/")
    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    stripe = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    req = CheckoutSessionRequest(
        amount=pkg["amount"],
        currency=pkg["currency"],
        success_url=f"{origin}/payment-success?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{origin}/paywall",
        metadata={"user_id": user["user_id"], "plan": body.plan, "source": "web_subscription"},
    )
    session = await stripe.create_checkout_session(req)
    await db.payment_transactions.insert_one({
        "id": str(uuid.uuid4()),
        "session_id": session.session_id,
        "user_id": user["user_id"],
        "plan": body.plan,
        "amount": pkg["amount"],
        "currency": pkg["currency"],
        "status": "initiated",
        "payment_status": "pending",
        "created_at": now_iso(),
        "updated_at": now_iso(),
    })
    return {"url": session.url, "session_id": session.session_id}


async def _grant_premium(txn: dict):
    if txn.get("status") == "complete":
        return
    pkg = PACKAGES.get(txn["plan"], PACKAGES["monthly"])
    until = (datetime.now(timezone.utc) + timedelta(days=pkg["days"])).isoformat()
    await db.users.update_one(
        {"user_id": txn["user_id"]},
        {"$set": {"plan": "premium", "premium_until": until}},
    )
    await db.payment_transactions.update_one(
        {"session_id": txn["session_id"]},
        {"$set": {"status": "complete", "payment_status": "paid", "updated_at": now_iso()}},
    )


async def _activate_premium(user_id: str, plan: str, expires_iso: Optional[str] = None):
    """Grant/extend Premium. Uses store-provided expiry when available, else plan duration."""
    if not expires_iso:
        pkg = PACKAGES.get(plan, PACKAGES["monthly"])
        expires_iso = (datetime.now(timezone.utc) + timedelta(days=pkg["days"])).isoformat()
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"plan": "premium", "premium_until": expires_iso}},
    )
    return expires_iso



@api.get("/payments/status/{session_id}")
async def payment_status(session_id: str, user=Depends(get_current_user)):
    txn = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not txn:
        raise HTTPException(404, "Transaction not found")
    stripe = StripeCheckout(api_key=STRIPE_API_KEY)
    status = await stripe.get_checkout_status(session_id)
    if status.payment_status == "paid":
        await _grant_premium(txn)
    else:
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {"status": status.status, "payment_status": status.payment_status, "updated_at": now_iso()}},
        )
    return {"status": status.status, "payment_status": status.payment_status, "plan": txn["plan"]}


@api.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get("Stripe-Signature")
    stripe = StripeCheckout(api_key=STRIPE_API_KEY)
    try:
        event = await stripe.handle_webhook(payload, sig)
    except Exception as e:
        logger.warning(f"Webhook error: {e}")
        raise HTTPException(400, "Invalid webhook")
    if event.payment_status == "paid" and event.session_id:
        txn = await db.payment_transactions.find_one({"session_id": event.session_id}, {"_id": 0})
        if txn:
            await _grant_premium(txn)
    return {"ok": True}


# ----------------------------- native in-app purchases -----------------------------
@api.get("/payments/iap/products")
async def iap_products():
    """Product IDs the mobile client should query from the store, mapped to plans/pricing."""
    out = []
    for pid, plan in IAP_PRODUCTS.items():
        pkg = PACKAGES[plan]
        out.append({"product_id": pid, "plan": plan, "name": pkg["name"], "amount": pkg["amount"]})
    return {"products": out}


async def _verify_apple(receipt: str):
    """Verify an iOS receipt via Apple verifyReceipt (prod, sandbox fallback). Returns (info|None, err)."""
    if not APPLE_SHARED_SECRET:
        return None, "apple_not_configured"
    payload = {"receipt-data": receipt, "password": APPLE_SHARED_SECRET, "exclude-old-transactions": True}
    try:
        async with httpx.AsyncClient(timeout=20) as hc:
            r = await hc.post("https://buy.itunes.apple.com/verifyReceipt", json=payload)
            data = r.json()
            if data.get("status") == 21007:  # sandbox receipt sent to prod
                r = await hc.post("https://sandbox.itunes.apple.com/verifyReceipt", json=payload)
                data = r.json()
    except Exception as e:
        logger.warning(f"Apple verify error: {e}")
        return None, "apple_request_failed"
    if data.get("status") != 0:
        return None, f"apple_status_{data.get('status')}"
    infos = data.get("latest_receipt_info") or data.get("receipt", {}).get("in_app", [])
    if not infos:
        return None, "apple_no_transactions"
    latest = sorted(infos, key=lambda x: int(x.get("expires_date_ms", x.get("purchase_date_ms", "0")))).pop()
    exp_ms = latest.get("expires_date_ms")
    expires_iso = (
        datetime.fromtimestamp(int(exp_ms) / 1000, tz=timezone.utc).isoformat() if exp_ms else None
    )
    return {
        "product_id": latest.get("product_id"),
        "transaction_id": latest.get("original_transaction_id") or latest.get("transaction_id"),
        "expires_iso": expires_iso,
    }, None


async def _verify_google(product_id: str, purchase_token: str):
    """Verify an Android subscription purchase via Play Developer API. Returns (info|None, err)."""
    if not (GOOGLE_PLAY_SERVICE_ACCOUNT_JSON and GOOGLE_PLAY_PACKAGE_NAME):
        return None, "google_not_configured"
    try:
        from google.oauth2 import service_account
        from google.auth.transport.requests import Request as GoogleRequest

        info = json.loads(GOOGLE_PLAY_SERVICE_ACCOUNT_JSON)
        creds = service_account.Credentials.from_service_account_info(
            info, scopes=["https://www.googleapis.com/auth/androidpublisher"]
        )
        creds.refresh(GoogleRequest())
        token = creds.token
        url = (
            f"https://androidpublisher.googleapis.com/androidpublisher/v3/applications/"
            f"{GOOGLE_PLAY_PACKAGE_NAME}/purchases/subscriptionsv2/tokens/{purchase_token}"
        )
        async with httpx.AsyncClient(timeout=20) as hc:
            r = await hc.get(url, headers={"Authorization": f"Bearer {token}"})
        if r.status_code != 200:
            return None, f"google_status_{r.status_code}"
        data = r.json()
    except Exception as e:
        logger.warning(f"Google verify error: {e}")
        return None, "google_request_failed"
    if data.get("subscriptionState") not in ("SUBSCRIPTION_STATE_ACTIVE", "SUBSCRIPTION_STATE_IN_GRACE_PERIOD"):
        return None, f"google_state_{data.get('subscriptionState')}"
    line_items = data.get("lineItems") or []
    expires_iso = line_items[0].get("expiryTime") if line_items else None
    return {"product_id": product_id, "transaction_id": purchase_token, "expires_iso": expires_iso}, None


@api.post("/payments/iap/verify")
async def verify_iap(body: IAPVerifyIn, user=Depends(get_current_user)):
    """Server-side verify an Apple/Google purchase, then grant Premium (idempotent)."""
    if body.product_id not in IAP_PRODUCTS:
        raise HTTPException(400, "Unknown product")
    plan = IAP_PRODUCTS[body.product_id]

    if body.platform == "ios":
        if not body.receipt:
            raise HTTPException(400, "Missing receipt")
        info, err = await _verify_apple(body.receipt)
    elif body.platform == "android":
        if not body.purchase_token:
            raise HTTPException(400, "Missing purchase token")
        info, err = await _verify_google(body.product_id, body.purchase_token)
    else:
        raise HTTPException(400, "Invalid platform")

    if err:
        # 503 when store credentials are not configured yet; 400 for a failed/invalid purchase.
        code = 503 if err.endswith("not_configured") else 400
        raise HTTPException(code, f"Verification failed ({err})")

    txn_key = info.get("transaction_id") or body.transaction_id or str(uuid.uuid4())
    existing = await db.iap_transactions.find_one({"transaction_id": txn_key}, {"_id": 0})
    if existing and existing.get("user_id") == user["user_id"] and existing.get("status") == "complete":
        return {"valid": True, "plan": plan, "premium_until": existing.get("premium_until"), "already_active": True}

    expires_iso = await _activate_premium(user["user_id"], plan, info.get("expires_iso"))
    await db.iap_transactions.update_one(
        {"transaction_id": txn_key},
        {"$set": {
            "transaction_id": txn_key,
            "user_id": user["user_id"],
            "platform": body.platform,
            "product_id": body.product_id,
            "plan": plan,
            "premium_until": expires_iso,
            "status": "complete",
            "updated_at": now_iso(),
        }, "$setOnInsert": {"created_at": now_iso()}},
        upsert=True,
    )
    return {"valid": True, "plan": plan, "premium_until": expires_iso}


# ----------------------------- analytics -----------------------------
@api.get("/analytics")
async def analytics(user=Depends(get_current_user)):
    uid = user["user_id"]
    projects = await db.projects.find({"user_id": uid}, {"_id": 0, "status": 1, "tasks": 1}).to_list(500)
    assets = await db.assets.find({"user_id": uid}, {"_id": 0, "type": 1, "created_at": 1}).to_list(500)

    status_counts = {"idea": 0, "branding": 0, "done": 0}
    total_tasks = done_tasks = 0
    for p in projects:
        st = p.get("status", "idea")
        status_counts[st] = status_counts.get(st, 0) + 1
        for t in p.get("tasks", []):
            total_tasks += 1
            if t.get("done"):
                done_tasks += 1

    type_counts: dict = {}
    for a in assets:
        type_counts[a["type"]] = type_counts.get(a["type"], 0) + 1

    # last 7 days asset generation activity
    days = [(datetime.now(timezone.utc) - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(6, -1, -1)]
    day_counts = {d: 0 for d in days}
    for a in assets:
        d = (a.get("created_at") or "")[:10]
        if d in day_counts:
            day_counts[d] += 1
    activity = [{"date": d, "count": day_counts[d]} for d in days]

    return {
        "total_projects": len(projects),
        "total_assets": len(assets),
        "status_counts": status_counts,
        "type_counts": type_counts,
        "tasks": {"total": total_tasks, "done": done_tasks},
        "activity": activity,
    }


# ----------------------------- health -----------------------------
@api.get("/")
async def root():
    return {"service": "CreatorForge", "status": "ok"}



@api.get("/ai/usage")
async def ai_usage(user=Depends(get_current_user)):
    """Return current in-process AI usage counters (resets on restart)."""
    return ai.get_ai_usage()


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.projects.create_index("user_id")
    await db.brand_kits.create_index("user_id")
    await db.assets.create_index("user_id")
    await load_flags()
    from seed import seed_demo
    try:
        await seed_demo(db)
    except Exception as e:
        logger.warning(f"Seed skipped: {e}")


@app.on_event("shutdown")
async def shutdown():
    client.close()

