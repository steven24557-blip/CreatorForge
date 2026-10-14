"""Asset generation and management routes."""
from fastapi import APIRouter, Depends, HTTPException
from typing import Optional, List
from .deps import db, get_current_user
from ownership import require_owner
from models import *
from helpers import *
import ai_service as ai
import auth_utils as auth

router = APIRouter()

@router.post("/assets/generate")
async def generate_asset(body: AssetIn, user=Depends(get_current_user)):
    await check_and_count_generation(user)
    aid = auth.new_id()
    try:
        b64 = await ai.generate_image(aid, body.prompt, memory_context(user))
    except Exception:
        await refund_generation(user)
        raise
    if not b64:
        raise HTTPException(500, "Image generation failed")
    asset = {
        "id": aid,
        "user_id": user["user_id"],
        "project_id": body.project_id,
        "brand_kit_id": body.brand_kit_id,
        "type": body.type,
        "prompt": body.prompt,
        "image_b64": b64,
        "created_at": now_iso(),
    }
    await db.assets.insert_one(asset)
    return {"asset": {k: v for k, v in asset.items() if k != "_id"}}


@router.post("/assets/packaging")
async def packaging(body: PackagingIn, user=Depends(get_current_user)):
    await check_and_count_packaging(user)
    style = PACKAGING_STYLES.get(body.style, PACKAGING_STYLES["box"])
    prompt = f"Professional product packaging mockup: {style}"
    try:
        b64 = await ai.generate_image(
            auth.new_id(), prompt, memory_context(user), images=body.images
        )
    except Exception:
        await refund_packaging(user)
        raise
    if not b64:
        raise HTTPException(500, "Packaging generation failed")
    aid = auth.new_id()
    asset = {
        "id": aid,
        "user_id": user["user_id"],
        "brand_kit_id": body.brand_kit_id,
        "type": "packaging",
        "prompt": prompt,
        "image_b64": b64,
        "created_at": now_iso(),
    }
    await db.assets.insert_one(asset)
    return {"asset": {k: v for k, v in asset.items() if k != "_id"}}


@router.get("/assets")
async def list_assets(user=Depends(get_current_user)):
    assets = await db.assets.find(
        {"user_id": user["user_id"]}, {"_id": 0, "image_b64": 0}
    ).sort("created_at", -1).to_list(200)
    return {"assets": assets}


@router.get("/assets/{aid}")
async def get_asset(aid: str, user=Depends(get_current_user)):
    a = await require_owner(db, "assets", aid, user)
    return {"asset": a}


@router.delete("/assets/{aid}")
async def delete_asset(aid: str, user=Depends(get_current_user)):
    await require_owner(db, "assets", aid, user)
    await db.assets.delete_one({"id": aid})
    return {"ok": True}


@router.get("/assets/{aid}/versions")
async def asset_versions(aid: str, user=Depends(get_current_user)):
    await require_owner(db, "assets", aid, user)
    versions = await db.asset_versions.find(
        {"asset_id": aid}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return {"versions": versions}


@router.post("/assets/{aid}/regenerate")
async def regenerate(aid: str, body: RegenerateIn, user=Depends(get_current_user)):
    a = await require_owner(db, "assets", aid, user)
    await check_and_count_generation(user)
    prompt = body.prompt or a.get("prompt", "")
    try:
        b64 = await ai.generate_image(aid, prompt, memory_context(user))
    except Exception:
        await refund_generation(user)
        raise
    if not b64:
        raise HTTPException(500, "Regeneration failed")
    # store previous version
    await db.asset_versions.insert_one({
        "id": auth.new_id(),
        "asset_id": aid,
        "image_b64": a.get("image_b64"),
        "prompt": a.get("prompt"),
        "created_at": now_iso(),
    })
    await db.assets.update_one(
        {"id": aid},
        {"$set": {"image_b64": b64, "prompt": prompt, "updated_at": now_iso()}},
    )
    return {"ok": True}


@router.post("/assets/{aid}/revert")
async def revert(aid: str, body: RevertIn, user=Depends(get_current_user)):
    await require_owner(db, "assets", aid, user)
    version = await db.asset_versions.find_one(
        {"id": body.version_id, "asset_id": aid}, {"_id": 0}
    )
    if not version:
        raise HTTPException(404, "Version not found")
    await db.assets.update_one(
        {"id": aid},
        {"$set": {
            "image_b64": version.get("image_b64"),
            "prompt": version.get("prompt"),
            "updated_at": now_iso(),
        }},
    )
    return {"ok": True}
