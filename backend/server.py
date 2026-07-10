"""CreatorForge backend — auth, projects/ideas, brand kits, AI assets, payments, milestones."""
import os
import uuid
import logging
import tempfile
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import Optional, List

from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Request
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


class CheckoutIn(BaseModel):
    plan: str
    origin_url: str


# ----------------------------- helpers -----------------------------
def public_user(u: dict) -> dict:
    return {k: v for k, v in u.items() if k not in ("password", "_id")}


def _default_usage():
    return {"date": today_str(), "generations": 0, "exports": 0}


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


async def update_streak(user_id: str):
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0, "streak": 1})
    streak = (u or {}).get("streak") or {"count": 0, "last_date": None}
    today = today_str()
    if streak.get("last_date") == today:
        return streak
    yest = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
    streak["count"] = streak.get("count", 0) + 1 if streak.get("last_date") == yest else 1
    streak["last_date"] = today
    await db.users.update_one({"user_id": user_id}, {"$set": {"streak": streak}})
    return streak


def memory_context(user: dict) -> str:
    """Build a concise Smart Brand Memory prompt fragment (empty if disabled/empty)."""
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
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0, "brand_memory": 1})
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
        "created_at": now_iso(),
    }


@api.post("/auth/register")
async def register(body: RegisterIn):
    if await db.users.find_one({"email": body.email.lower()}):
        raise HTTPException(status_code=409, detail="Email already registered")
    uid = auth.new_user_id()
    doc = _new_user_doc(uid, body.email, body.name, password=auth.hash_password(body.password))
    await db.users.insert_one(doc)
    return {"token": auth.make_jwt(uid), "user": public_user(doc)}


@api.post("/auth/login")
async def login(body: LoginIn):
    u = await db.users.find_one({"email": body.email.lower()})
    if not u or not u.get("password") or not auth.verify_password(body.password, u["password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return {"token": auth.make_jwt(u["user_id"]), "user": public_user(u)}


@api.post("/auth/google")
async def google_auth(body: GoogleIn):
    try:
        data = await auth.fetch_emergent_session(body.session_id)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Google session")
    email = data["email"].lower()
    u = await db.users.find_one({"email": email})
    if not u:
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
    await update_streak(user["user_id"])
    newly = await recompute_milestones(user["user_id"])
    doc.pop("_id", None)
    return {"project": doc, "newly_unlocked": newly}


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
    p = await db.projects.find_one({"id": pid, "user_id": user["user_id"]}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Project not found")
    assets = await db.assets.find({"project_id": pid}, {"_id": 0, "image_b64": 0}).to_list(100)
    kit = None
    if p.get("brand_kit_id"):
        kit = await db.brand_kits.find_one({"id": p["brand_kit_id"]}, {"_id": 0})
    return {"project": p, "assets": assets, "brand_kit": kit}


@api.patch("/projects/{pid}")
async def patch_project(pid: str, body: ProjectPatch, user=Depends(get_current_user)):
    p = await db.projects.find_one({"id": pid, "user_id": user["user_id"]})
    if not p:
        raise HTTPException(404, "Project not found")
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
    await db.projects.delete_one({"id": pid, "user_id": user["user_id"]})
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
    k = await db.brand_kits.find_one({"id": kid, "user_id": user["user_id"]}, {"_id": 0})
    if not k:
        raise HTTPException(404, "Brand kit not found")
    assets = await db.assets.find({"brand_kit_id": kid}, {"_id": 0, "image_b64": 0}).to_list(100)
    return {"brand_kit": k, "assets": assets}


@api.patch("/brand-kits/{kid}")
async def patch_brand_kit(kid: str, body: BrandKitPatch, user=Depends(get_current_user)):
    update = {k: v for k, v in body.dict().items() if v is not None}
    if not update:
        raise HTTPException(400, "Nothing to update")
    await db.brand_kits.update_one({"id": kid, "user_id": user["user_id"]}, {"$set": update})
    return {"brand_kit": await db.brand_kits.find_one({"id": kid}, {"_id": 0})}


@api.delete("/brand-kits/{kid}")
async def delete_brand_kit(kid: str, user=Depends(get_current_user)):
    await db.brand_kits.delete_one({"id": kid, "user_id": user["user_id"]})
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
    await update_streak(user["user_id"])
    newly = await recompute_milestones(user["user_id"])
    doc.pop("_id", None)
    return {"asset": doc, "newly_unlocked": newly}


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
    a = await db.assets.find_one({"id": aid, "user_id": user["user_id"]}, {"_id": 0})
    if not a:
        raise HTTPException(404, "Asset not found")
    return {"asset": a}


@api.delete("/assets/{aid}")
async def delete_asset(aid: str, user=Depends(get_current_user)):
    await db.assets.delete_one({"id": aid, "user_id": user["user_id"]})
    return {"ok": True}


# ----------------------------- usage / milestones -----------------------------
@api.get("/usage")
async def get_usage(user=Depends(get_current_user)):
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
    from seed import seed_demo
    try:
        await seed_demo(db)
    except Exception as e:
        logger.warning(f"Seed skipped: {e}")


@app.on_event("shutdown")
async def shutdown():
    client.close()
