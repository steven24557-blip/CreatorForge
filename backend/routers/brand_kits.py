"""Brand kit and gallery routes."""
from fastapi import APIRouter, Depends, HTTPException
from typing import Optional, List
from .deps import db, get_current_user
from ownership import require_owner
from models import *
from helpers import *
import ai_service as ai
import auth_utils as auth

router = APIRouter()

@router.post("/brand-kits")
async def create_brand_kit(body: BrandKitIn, user=Depends(get_current_user)):
    await check_and_count_generation(user)
    kid = auth.new_id()
    kit = {
        "id": kid,
        "user_id": user["user_id"],
        "project_id": body.project_id,
        "name": body.name or "Untitled Kit",
        "context": body.context,
        "colors": body.colors or [],
        "fonts": body.fonts or {},
        "style_rules": body.style_rules or [],
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    if body.auto_generate and body.context:
        try:
            palette = await ai.generate_palette(kid, body.context, memory_context(user))
            kit.update(palette)
        except Exception:
            await refund_generation(user)
            raise
    await db.brand_kits.insert_one(kit)
    return {"brand_kit": {k: v for k, v in kit.items() if k != "_id"}}


@router.get("/brand-kits")
async def list_brand_kits(user=Depends(get_current_user)):
    kits = await db.brand_kits.find(
        {"user_id": user["user_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return {"brand_kits": kits}


@router.get("/brand-kits/{kid}")
async def get_brand_kit(kid: str, user=Depends(get_current_user)):
    k = await require_owner(db, "brand_kits", kid, user)
    assets = await db.assets.find(
        {"brand_kit_id": kid}, {"_id": 0, "image_b64": 0}
    ).to_list(100)
    return {"brand_kit": k, "assets": assets}


@router.patch("/brand-kits/{kid}")
async def patch_brand_kit(kid: str, body: BrandKitPatch, user=Depends(get_current_user)):
    await require_owner(db, "brand_kits", kid, user)
    update = {k: v for k, v in body.dict().items() if v is not None}
    if not update:
        raise HTTPException(400, "Nothing to update")
    update["updated_at"] = now_iso()
    await db.brand_kits.update_one({"id": kid}, {"$set": update})
    return {"brand_kit": await db.brand_kits.find_one({"id": kid}, {"_id": 0})}


@router.delete("/brand-kits/{kid}")
async def delete_brand_kit(kid: str, user=Depends(get_current_user)):
    await require_owner(db, "brand_kits", kid, user)
    await db.brand_kits.delete_one({"id": kid})
    return {"ok": True}


@router.post("/brand-kits/{kid}/logo")
async def generate_logo(kid: str, user=Depends(get_current_user)):
    k = await require_owner(db, "brand_kits", kid, user)
    await check_and_count_generation(user)
    prompt = f"Logo for {k.get('name', 'brand')}. Style: {', '.join(k.get('style_rules', []))}"
    try:
        b64 = await ai.generate_image(kid, prompt, memory_context(user))
    except Exception:
        await refund_generation(user)
        raise
    if not b64:
        raise HTTPException(500, "Logo generation failed")
    aid = auth.new_id()
    asset = {
        "id": aid,
        "user_id": user["user_id"],
        "brand_kit_id": kid,
        "type": "logo",
        "prompt": prompt,
        "image_b64": b64,
        "created_at": now_iso(),
    }
    await db.assets.insert_one(asset)
    return {"asset": {k: v for k, v in asset.items() if k != "_id"}}


@router.post("/brand-kits/{kid}/publish")
async def publish_brand_kit(kid: str, body: PublishIn, user=Depends(get_current_user)):
    k = await require_owner(db, "brand_kits", kid, user)
    update = {"public": body.public, "updated_at": now_iso()}
    if body.alias:
        update["alias"] = body.alias
    await db.brand_kits.update_one({"id": kid}, {"$set": update})
    return {"ok": True}


@router.get("/gallery")
async def gallery():
    kits = await db.brand_kits.find(
        {"public": True}, {"_id": 0, "user_id": 0}
    ).sort("created_at", -1).to_list(50)
    return {"gallery": kits}


@router.post("/gallery/{kid}/remix")
async def remix(kid: str, user=Depends(get_current_user)):
    original = await db.brand_kits.find_one({"id": kid, "public": True}, {"_id": 0})
    if not original:
        raise HTTPException(404, "Public kit not found")
    await check_and_count_generation(user)
    new_id = auth.new_id()
    kit = {**original, "id": new_id, "user_id": user["user_id"], "public": False, "created_at": now_iso()}
    kit.pop("_id", None)
    await db.brand_kits.insert_one(kit)
    return {"brand_kit": kit}


@router.post("/gallery/{kid}/report")
async def report(kid: str, body: ReportIn, user=Depends(get_current_user)):
    await db.reports.insert_one({
        "id": auth.new_id(),
        "brand_kit_id": kid,
        "reporter_id": user["user_id"],
        "reason": body.reason,
        "created_at": now_iso(),
    })
    return {"ok": True}
