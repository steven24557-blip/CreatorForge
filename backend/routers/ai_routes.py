"""AI and voice routes."""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from .deps import db, get_current_user
from models import *
from helpers import *
import ai_service as ai
import auth_utils as auth
import tempfile
import os

router = APIRouter()

@router.post("/ai/refine")
async def refine(body: RefineIn, user=Depends(get_current_user)):
    await check_and_count_generation(user)
    try:
        result = await ai.refine_idea(
            auth.new_id(), body.raw_idea, body.mode, memory_context(user)
        )
    except Exception:
        await refund_generation(user)
        raise
    return result


@router.post("/ai/refine-project")
async def refine_project(body: RefineProjectIn, user=Depends(get_current_user)):
    p = await require_owner(db, "projects", body.project_id, user)
    await check_and_count_generation(user)
    context = f"{p.get('title', '')}\n{p.get('summary', '')}"
    try:
        reply = await ai.chat_refine(auth.new_id(), context, body.message)
    except Exception:
        await refund_generation(user)
        raise
    return {"reply": reply}


@router.post("/ai/taglines")
async def taglines(body: TaglineIn, user=Depends(get_current_user)):
    await check_and_count_generation(user)
    try:
        lines = await ai.generate_taglines(
            auth.new_id(), body.context, memory_context(user)
        )
    except Exception:
        await refund_generation(user)
        raise
    return {"taglines": lines}


@router.post("/voice/transcribe")
async def transcribe(file: UploadFile = File(...), user=Depends(get_current_user)):
    await check_and_count_generation(user)
    suffix = os.path.splitext(file.filename or "")[1] or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        path = tmp.name
    try:
        text = await ai.transcribe_audio(path)
    except Exception:
        await refund_generation(user)
        raise
    finally:
        os.unlink(path)
    return {"text": text}


@router.get("/ai/usage")
async def ai_usage(user=Depends(get_current_user)):
    return ai.get_ai_usage()
