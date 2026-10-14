"""Project CRUD routes."""
from fastapi import APIRouter, Depends, HTTPException
from typing import Optional, List
from .deps import db, get_current_user
from ownership import require_owner
from models import *
from helpers import *
import ai_service as ai
import auth_utils as auth

router = APIRouter()

@router.post("/projects")
async def create_project(body: ProjectIn, user=Depends(get_current_user)):
    pid = auth.new_id()
    project = {
        "id": pid,
        "user_id": user["user_id"],
        "title": body.title,
        "summary": body.summary,
        "pitch": body.pitch,
        "target_audience": body.target_audience,
        "value_prop": body.value_prop,
        "tasks": body.tasks,
        "brand_keywords": body.brand_keywords,
        "source_idea": body.source_idea,
        "status": "active",
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.projects.insert_one(project)
    return {"project": {k: v for k, v in project.items() if k != "_id"}}


@router.get("/projects")
async def list_projects(user=Depends(get_current_user)):
    projects = await db.projects.find(
        {"user_id": user["user_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return {"projects": projects}


@router.get("/projects/{pid}")
async def get_project(pid: str, user=Depends(get_current_user)):
    p = await require_owner(db, "projects", pid, user)
    assets = await db.assets.find(
        {"project_id": pid}, {"_id": 0, "image_b64": 0}
    ).to_list(100)
    kit = None
    if p.get("brand_kit_id"):
        kit = await db.brand_kits.find_one({"id": p["brand_kit_id"]}, {"_id": 0})
    return {"project": p, "assets": assets, "brand_kit": kit}


@router.patch("/projects/{pid}")
async def patch_project(pid: str, body: ProjectPatch, user=Depends(get_current_user)):
    p = await require_owner(db, "projects", pid, user)
    update = {k: v for k, v in body.dict().items() if v is not None}
    update["updated_at"] = now_iso()
    await db.projects.update_one({"id": pid}, {"$set": update})
    return {"ok": True}


@router.delete("/projects/{pid}")
async def delete_project(pid: str, user=Depends(get_current_user)):
    await require_owner(db, "projects", pid, user)
    await db.projects.delete_one({"id": pid})
    await db.assets.delete_many({"project_id": pid})
    return {"ok": True}
