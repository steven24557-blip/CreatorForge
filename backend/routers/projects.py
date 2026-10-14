"""Router extracted from server.py."""
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Header
from typing import Optional, List
from pydantic import BaseModel, Field, EmailStr
from .deps import db, get_current_user
from ownership import require_owner
import ai_service as ai
from models import *
from helpers import *

router = APIRouter()

@router.post("/projects")
async def create_project(body: ProjectIn, user=Depends(get_current_user)):
    raise HTTPException(501, "Not yet migrated")

@router.get("/projects")
async def list_projects(user=Depends(get_current_user)):
    raise HTTPException(501, "Not yet migrated")

@router.get("/projects/{pid}")
async def get_project(pid: str, user=Depends(get_current_user)):
    p = await require_owner(db, "projects", pid, user)
    return {"project": p}

@router.patch("/projects/{pid}")
async def patch_project(pid: str, body: ProjectPatch, user=Depends(get_current_user)):
    p = await require_owner(db, "projects", pid, user)
    raise HTTPException(501, "Not yet migrated")

@router.delete("/projects/{pid}")
async def delete_project(pid: str, user=Depends(get_current_user)):
    await require_owner(db, "projects", pid, user)
    raise HTTPException(501, "Not yet migrated")
