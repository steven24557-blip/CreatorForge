"""
CreatorForge AI service layer.

All generative calls route through Emergent's Universal LLM key (EMERGENT_LLM_KEY):
  - Text ideation / refinement  -> Anthropic Claude Sonnet 4.6
  - Branded image generation     -> Gemini Nano Banana (gemini-3.1-flash-image-preview)
  - Voice memo transcription      -> OpenAI Whisper (whisper-1)

NVIDIA Inception optimization notes (for future scaling):
  These calls are the hot path for cost/latency. When self-hosting inference,
  swap the text path to a TensorRT-LLM optimized endpoint (FP8/INT8) and route
  image generation through an NVIDIA NIM microservice on GPU credits from the
  Inception program. Batch idea-refinement requests and cache brand-style
  system prompts to cut redundant token spend. Keep prompts terse + structured
  (JSON out) so we minimise output tokens — the single biggest cost lever.
"""
import os
import json
import base64
from pathlib import Path
from dotenv import load_dotenv

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
from emergentintegrations.llm.openai.speech_to_text import OpenAISpeechToText

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

EMERGENT_LLM_KEY = os.environ["EMERGENT_LLM_KEY"]

TEXT_MODEL = ("anthropic", "claude-sonnet-4-6")
IMAGE_MODEL = ("gemini", "gemini-3.1-flash-image-preview")


def _new_chat(session_id: str, system_message: str) -> LlmChat:
    return LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=system_message,
    )


def _extract_json(raw: str):
    """Claude sometimes wraps JSON in prose / fences. Pull the JSON block out."""
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1]
        if raw.lstrip().startswith("json"):
            raw = raw.lstrip()[4:]
    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end != -1:
        raw = raw[start : end + 1]
    return json.loads(raw)


async def refine_idea(session_id: str, raw_idea: str, mode: str, memory: str = "") -> dict:
    """Turn a raw idea into a structured plan / pitch / task-breakdown."""
    mode = (mode or "plan").lower()
    guides = {
        "plan": "Produce a concise business/creative plan.",
        "pitch": "Produce a punchy investor/client pitch.",
        "tasks": "Produce an actionable task breakdown.",
    }
    system = (
        "You are CreatorForge, a sharp creative strategist for founders and creators. "
        "Return ONLY minified JSON. No prose, no markdown fences."
    )
    mem_line = f"\n{memory}\nWhen suggesting brand_keywords, stay consistent with the above.\n" if memory else ""
    prompt = f"""{guides.get(mode, guides['plan'])}
{mem_line}
Raw idea from the user:
\"\"\"{raw_idea}\"\"\"

Return JSON with EXACTLY this shape:
{{
  "title": "short punchy project title (max 6 words)",
  "summary": "2-3 sentence refined summary",
  "pitch": "one compelling elevator pitch sentence",
  "target_audience": "who this is for",
  "value_prop": "the core value proposition",
  "tasks": ["4 to 6 concrete next-step tasks"],
  "brand_keywords": ["4 to 6 adjectives describing the ideal brand mood"]
}}"""
    chat = _new_chat(session_id, system).with_model(*TEXT_MODEL)
    resp = await chat.send_message(UserMessage(text=prompt))
    try:
        return _extract_json(resp)
    except Exception:
        return {
            "title": raw_idea[:40],
            "summary": resp[:400],
            "pitch": "",
            "target_audience": "",
            "value_prop": "",
            "tasks": [],
            "brand_keywords": [],
        }


async def chat_refine(session_id: str, context: str, message: str) -> str:
    """Conversational refinement inside a project (editorial, not chatty)."""
    system = (
        "You are CreatorForge's refinement co-pilot. You help creators sharpen ideas, "
        "plans and brand direction. Respond in clean, confident, editorial prose. "
        "Be specific and actionable. Keep it under 180 words."
    )
    prompt = f"Project context:\n{context}\n\nUser request: {message}"
    chat = _new_chat(session_id, system).with_model(*TEXT_MODEL)
    return await chat.send_message(UserMessage(text=prompt))


async def generate_taglines(session_id: str, context: str, memory: str = "") -> list:
    system = "You are a world-class copywriter. Return ONLY a JSON array of strings."
    mem_line = f"\n{memory}\nKeep the tone consistent with the above.\n" if memory else ""
    prompt = (
        f"Based on this brand/idea context, write 5 short, memorable taglines "
        f"(max 6 words each). Return JSON array only.{mem_line}\n\n{context}"
    )
    chat = _new_chat(session_id, system).with_model(*TEXT_MODEL)
    resp = await chat.send_message(UserMessage(text=prompt))
    try:
        raw = resp.strip()
        s, e = raw.find("["), raw.rfind("]")
        return json.loads(raw[s : e + 1])
    except Exception:
        return [l.strip("-• ") for l in resp.splitlines() if l.strip()][:5]


async def generate_palette(session_id: str, context: str, memory: str = "") -> dict:
    system = (
        "You are a senior brand designer. Return ONLY minified JSON, no prose."
    )
    mem_line = f"\nBRAND CONSISTENCY: {memory}\nKeep this new palette visually consistent with the user's established style above unless the context clearly calls for a different direction.\n" if memory else ""
    prompt = f"""Design an on-brand colour palette for this brand context:
\"\"\"{context}\"\"\"
{mem_line}
Return JSON EXACTLY as:
{{
  "name": "palette name (2-3 words)",
  "colors": ["#RRGGBB", "#RRGGBB", "#RRGGBB", "#RRGGBB", "#RRGGBB"],
  "fonts": {{"heading": "a real font family name", "body": "a real font family name"}},
  "style_rules": ["3 short brand style rules"]
}}
The 5 colors must be valid distinct hex codes (primary, secondary, accent, dark, light)."""
    chat = _new_chat(session_id, system).with_model(*TEXT_MODEL)
    resp = await chat.send_message(UserMessage(text=prompt))
    try:
        data = _extract_json(resp)
        assert isinstance(data.get("colors"), list) and len(data["colors"]) >= 3
        return data
    except Exception:
        return {
            "name": "Signature",
            "colors": ["#C5A880", "#1C1C1C", "#EAEAEA", "#0F0F0F", "#A3865D"],
            "fonts": {"heading": "Fraunces", "body": "Geist"},
            "style_rules": ["Keep it minimal", "Lead with the hero", "High contrast"],
        }


async def generate_image(session_id: str, prompt: str, memory: str = "", images: list | None = None) -> str | None:
    """Return a single base64-encoded PNG (no data: prefix) or None.

    `images` is an optional list of base64 PNG/JPEG strings used as visual references
    (e.g. a logo or product photo) so the output can incorporate them.
    """
    chat = _new_chat(session_id, "You are an expert brand & product visual designer.")
    chat.with_model(*IMAGE_MODEL).with_params(modalities=["image", "text"])
    full = prompt
    if memory:
        full = f"{prompt}\n\nBrand consistency guidance: {memory} Keep this visual on-brand and consistent with the user's established style."
    file_contents = [ImageContent(image_base64=b) for b in (images or []) if b]
    _text, out_images = await chat.send_message_multimodal_response(
        UserMessage(text=full, file_contents=file_contents or None)
    )
    if out_images:
        return out_images[0]["data"]  # base64 string
    return None


async def transcribe_audio(file_path: str) -> str:
    stt = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)
    with open(file_path, "rb") as f:
        resp = await stt.transcribe(file=f, model="whisper-1", response_format="json")
    # litellm transcription response exposes .text
    text = getattr(resp, "text", None)
    if text is None and isinstance(resp, dict):
        text = resp.get("text", "")
    return text or ""
