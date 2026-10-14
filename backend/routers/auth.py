"""Router extracted from server.py."""
from models import *
from helpers import *
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Header
from typing import Optional, List
from pydantic import BaseModel, Field, EmailStr
from .deps import db, get_current_user
from ownership import require_owner
import ai_service as ai
import auth_utils as auth

router = APIRouter()

@router.post("/auth/register")
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


@router.post("/auth/login")
async def login(body: LoginIn):
    await ensure_flags_fresh()
    u = await db.users.find_one({"email": body.email.lower()})
    if not u or not u.get("password") or not auth.verify_password(body.password, u["password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return {"token": auth.make_jwt(u["user_id"]), "user": public_user(u)}


@router.post("/auth/google")
async def google_auth(body: GoogleIn):
    await ensure_flags_fresh()
    session = await auth.verify_google_session(body.session_id)
    if not session:
        raise HTTPException(status_code=401, detail="Invalid Google session")
    email = session["email"].lower()
    u = await db.users.find_one({"email": email})
    if not u:
        if not _FLAGS.get("allow_new_signups"):
            raise HTTPException(status_code=403, detail="New sign-ups are currently closed.")
        uid = auth.new_user_id()
        u = _new_user_doc(uid, email, session.get("name") or email.split("@")[0])
        await db.users.insert_one(u)
    return {"token": auth.make_jwt(u["user_id"]), "user": public_user(u)}


@router.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return {"user": public_user(user)}


@router.post("/auth/logout")
async def logout():
    return {"ok": True}


@router.delete("/auth/account")
async def delete_account(user=Depends(get_current_user)):
    uid = user["user_id"]
    await db.projects.delete_many({"user_id": uid})
    await db.brand_kits.delete_many({"user_id": uid})
    await db.assets.delete_many({"user_id": uid})
    await db.users.delete_one({"user_id": uid})
    return {"ok": True}


@router.patch("/auth/theme")
async def set_theme(theme: str, user=Depends(get_current_user)):
    if theme not in ("light", "dark", "system"):
        raise HTTPException(400, "Invalid theme")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"theme": theme}})
    return {"ok": True}


@router.get("/brand-memory")
async def get_brand_memory(user=Depends(get_current_user)):
    return {"brand_memory": user.get("brand_memory") or {}}


@router.patch("/brand-memory")
async def patch_brand_memory(body: dict, user=Depends(get_current_user)):
    mem = user.get("brand_memory") or {}
    mem.update(body)
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"brand_memory": mem}})
    return {"brand_memory": mem}


@router.get("/privacy/admt")
async def admt_notice():
    return {"version": ADMT_NOTICE_VERSION, "notice": "ADMT notice text"}


@router.post("/privacy/admt-ack")
async def admt_ack(user=Depends(get_current_user)):
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"admt_ack_version": ADMT_NOTICE_VERSION, "admt_ack_at": now_iso()}},
    )
    return {"ok": True}


@router.post("/privacy/admt-optout")
async def admt_optout(body: AdmtOptOutIn, user=Depends(get_current_user)):
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"admt_opt_out": body.opt_out, "admt_opt_out_at": now_iso()}},
    )
    return {"ok": True}


@router.get("/config/flags")
async def get_flags():
    await ensure_flags_fresh()
    return {"flags": _FLAGS}


@router.get("/admin/feature-flags")
async def admin_get_flags(x_admin_key: str = Header(None)):
    if not ADMIN_API_KEY or x_admin_key != ADMIN_API_KEY:
        raise HTTPException(403, "Forbidden")
    await ensure_flags_fresh()
    return {"flags": _FLAGS}


@router.patch("/admin/feature-flags")
async def admin_set_flags(body: FlagsPatch, x_admin_key: str = Header(None)):
    if not ADMIN_API_KEY or x_admin_key != ADMIN_API_KEY:
        raise HTTPException(403, "Forbidden")
    updated = await set_flags(body.dict(exclude_none=True), updated_by="admin")
    return {"flags": updated}
