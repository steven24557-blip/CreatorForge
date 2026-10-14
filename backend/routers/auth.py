"""Auth, account, privacy, and feature-flag routes."""
from fastapi import APIRouter, Depends, HTTPException, Request
from typing import Optional
from .deps import db, get_current_user
from models import *
from helpers import *
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
    if not u or not auth.verify_password(body.password, u.get("password", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return {"token": auth.make_jwt(u["user_id"]), "user": public_user(u)}

@router.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return {"user": public_user(user)}

@router.post("/auth/logout")
async def logout(user=Depends(get_current_user)):
    return {"ok": True}

@router.delete("/auth/account")
async def delete_account(user=Depends(get_current_user)):
    await db.users.delete_one({"user_id": user["user_id"]})
    return {"ok": True}
