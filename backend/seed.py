"""Idempotent demo data so the app is impressive on first open."""
import uuid
from datetime import datetime, timezone

import auth_utils as auth

DEMO_EMAIL = "demo@creatorforge.app"
DEMO_PASSWORD = "creator123"


def _iso():
    return datetime.now(timezone.utc).isoformat()


async def seed_demo(db):
    existing = await db.users.find_one({"email": DEMO_EMAIL})
    if existing:
        return

    uid = auth.new_user_id()
    user = {
        "user_id": uid,
        "email": DEMO_EMAIL,
        "name": "Alex Rivera",
        "picture": "",
        "password": auth.hash_password(DEMO_PASSWORD),
        "plan": "free",
        "premium_until": None,
        "usage": {"date": datetime.now(timezone.utc).strftime("%Y-%m-%d"), "generations": 0, "exports": 0},
        "counters": {"ideas_created": 3, "assets_generated": 2, "projects_completed": 0},
        "streak": {"count": 2, "last_date": datetime.now(timezone.utc).strftime("%Y-%m-%d")},
        "unlocked": [],
        "bonus_credits": 0,
        "theme": "dark",
        "created_at": _iso(),
    }
    await db.users.insert_one(user)

    kit_id = str(uuid.uuid4())
    kit = {
        "id": kit_id,
        "user_id": uid,
        "project_id": None,
        "name": "Lumen Coffee",
        "colors": ["#C5A880", "#2B2118", "#F3 E9 DC".replace(" ", ""), "#0F0F0F", "#A3865D"],
        "fonts": {"heading": "Fraunces", "body": "Geist"},
        "style_rules": ["Warm & artisanal", "Generous whitespace", "Hand-crafted feel"],
        "logo": None,
        "created_at": _iso(),
    }
    kit["colors"] = ["#C5A880", "#2B2118", "#F3E9DC", "#0F0F0F", "#A3865D"]
    await db.brand_kits.insert_one(kit)

    projects = [
        {
            "id": str(uuid.uuid4()),
            "user_id": uid,
            "title": "Lumen Coffee Roasters",
            "summary": "A premium small-batch coffee brand focused on single-origin beans and a warm, artisanal in-store experience.",
            "pitch": "Craft coffee that tells the story of its origin — in every cup.",
            "target_audience": "Urban coffee lovers aged 25-40 who value craft and story.",
            "value_prop": "Traceable single-origin beans roasted weekly for peak freshness.",
            "brand_keywords": ["warm", "artisanal", "premium", "earthy", "crafted"],
            "source_idea": "A coffee shop that focuses on single origin beans",
            "status": "branding",
            "tasks": [
                {"id": str(uuid.uuid4()), "text": "Source 3 single-origin suppliers", "done": True},
                {"id": str(uuid.uuid4()), "text": "Design packaging labels", "done": False},
                {"id": str(uuid.uuid4()), "text": "Launch Instagram presence", "done": False},
            ],
            "brand_kit_id": kit_id,
            "refinements": [],
            "created_at": _iso(),
            "updated_at": _iso(),
        },
        {
            "id": str(uuid.uuid4()),
            "user_id": uid,
            "title": "FitPulse App",
            "summary": "A minimalist habit-tracking app that turns daily workouts into a satisfying streak-based game.",
            "pitch": "Turn your fitness goals into a streak you never want to break.",
            "target_audience": "Busy professionals wanting simple, motivating fitness tracking.",
            "value_prop": "Zero-friction logging with delightful streak rewards.",
            "brand_keywords": ["energetic", "clean", "bold", "modern"],
            "source_idea": "A habit tracker for workouts",
            "status": "idea",
            "tasks": [
                {"id": str(uuid.uuid4()), "text": "Define MVP feature set", "done": False},
                {"id": str(uuid.uuid4()), "text": "Sketch onboarding flow", "done": False},
            ],
            "brand_kit_id": None,
            "refinements": [],
            "created_at": _iso(),
            "updated_at": _iso(),
        },
        {
            "id": str(uuid.uuid4()),
            "user_id": uid,
            "title": "Bloom Florals",
            "summary": "Subscription flower delivery with seasonal, locally-sourced arrangements.",
            "pitch": "Fresh, local blooms at your door — every week.",
            "target_audience": "Design-conscious homeowners and gifters.",
            "value_prop": "Locally sourced, sustainably wrapped, always seasonal.",
            "brand_keywords": ["fresh", "elegant", "natural", "soft"],
            "source_idea": "Weekly flower subscription",
            "status": "done",
            "tasks": [{"id": str(uuid.uuid4()), "text": "Partner with local growers", "done": True}],
            "brand_kit_id": None,
            "refinements": [],
            "created_at": _iso(),
            "updated_at": _iso(),
        },
    ]
    await db.projects.insert_many(projects)
