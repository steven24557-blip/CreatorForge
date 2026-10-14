"""AI and voice routes."""
from fastapi import APIRouter, Depends, HTTPException
from .deps import db, get_current_user
import ai_service as ai
from models import *

router = APIRouter()

@router.post("/ai/refine")
async def refine(body: RefineIn, user=Depends(get_current_user)):
    raise HTTPException(501, "Not yet migrated")

@router.post("/ai/refine-project")
async def refine_project(body: RefineProjectIn, user=Depends(get_current_user)):
    raise HTTPException(501, "Not yet migrated")

@router.post("/ai/taglines")
async def taglines(body: TaglineIn, user=Depends(get_current_user)):
    raise HTTPException(501, "Not yet migrated")

@router.post("/voice/transcribe")
async def transcribe(file: UploadFile = File(...), user=Depends(get_current_user)):
    raise HTTPException(501, "Not yet migrated")

@router.get("/ai/usage")
async def ai_usage(user=Depends(get_current_user)):
    return ai.get_ai_usage()
