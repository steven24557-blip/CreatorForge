"""CreatorForge iteration 5 tests — Hooked-model habit design.

Covers:
  * POST /api/projects returns streak_event {count, extended, is_milestone};
    first-of-day => extended=true, second same-day => extended=false.
  * POST /api/assets/generate returns keys: asset, newly_unlocked, streak_event, surprise
    (surprise nullable due to randomness). Runs ONCE with a throwaway account.
  * Regression: /api/usage, /api/brand-memory, /api/analytics still work;
    brand-memory still learns from project creation.
"""
import os
import uuid
import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE:
    BASE = "https://brand-spark-12.preview.emergentagent.com"
API = f"{BASE}/api"


def H(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _register(prefix="iter5"):
    email = f"tester+{prefix}_{uuid.uuid4().hex[:8]}@creatorforge.app"
    r = requests.post(f"{API}/auth/register",
                      json={"email": email, "password": "pw12345", "name": "Iter5 Tester"},
                      timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"], email


# --------------------- Streak on POST /api/projects ---------------------
class TestStreakOnProjects:
    def test_first_project_of_day_extends_streak(self):
        token, _ = _register("streakp")

        body = {
            "title": "TEST_streak_first",
            "summary": "s", "pitch": "p", "tasks": [],
            "brand_keywords": ["premium"],
            "source_idea": "first project of the day"
        }
        r1 = requests.post(f"{API}/projects", json=body, headers=H(token), timeout=30)
        assert r1.status_code == 200, r1.text
        j1 = r1.json()
        # response shape
        assert "project" in j1 and "streak_event" in j1 and "newly_unlocked" in j1, j1
        se1 = j1["streak_event"]
        assert isinstance(se1, dict)
        for k in ("count", "extended", "is_milestone"):
            assert k in se1, f"missing {k} in streak_event={se1}"
        assert se1["extended"] is True, f"first-of-day should extend, got {se1}"
        assert se1["count"] >= 1
        # brand-new user, day 1 -> not a milestone (milestone days are 3/7/14/30/60/100)
        assert se1["is_milestone"] is False, f"count={se1['count']} should not be milestone"

        # Second creation same day -> extended must be false
        body2 = dict(body); body2["title"] = "TEST_streak_second"
        r2 = requests.post(f"{API}/projects", json=body2, headers=H(token), timeout=30)
        assert r2.status_code == 200, r2.text
        se2 = r2.json()["streak_event"]
        assert se2["extended"] is False, f"same-day second should be extended=false, got {se2}"
        # count unchanged for same-day
        assert se2["count"] == se1["count"], f"count should not increment same day: {se1} -> {se2}"


# --------------------- Asset generate response shape ---------------------
class TestAssetGenerateSurpriseShape:
    """Run ONCE only - costs 1 image generation."""

    def test_generate_returns_expected_keys(self):
        token, _ = _register("gensurp")

        # Need a project + brand kit first (auto=true does Claude palette, no image)
        pr = requests.post(f"{API}/projects", json={
            "title": "TEST_gen_shape",
            "summary": "s", "pitch": "p", "tasks": [],
            "brand_keywords": ["earthy"],
            "source_idea": "shape verification project",
        }, headers=H(token), timeout=30)
        assert pr.status_code == 200, pr.text
        pid = pr.json()["project"]["id"]

        bk = requests.post(f"{API}/brand-kits", json={
            "project_id": pid, "name": "TEST_gen_kit", "auto_generate": True,
        }, headers=H(token), timeout=90)
        assert bk.status_code == 200, bk.text
        kit_id = bk.json()["brand_kit"]["id"]

        # Grab bonus_credits before, so we can validate credit/boost increments if surprise fires
        before = requests.get(f"{API}/usage", headers=H(token), timeout=15).json()
        bc_before = before.get("bonus_credits", 0)

        gen = requests.post(f"{API}/assets/generate", json={
            "project_id": pid,
            "prompt": "hero visual for TEST_gen_shape",
            "type": "social",
            "brand_kit_id": kit_id,
        }, headers=H(token), timeout=120)
        assert gen.status_code == 200, gen.text
        j = gen.json()

        # Required keys
        for k in ("asset", "newly_unlocked", "streak_event", "surprise"):
            assert k in j, f"missing {k} in response keys={list(j.keys())}"

        # asset payload sanity
        asset = j["asset"] or {}
        b64 = asset.get("image_b64") or asset.get("base64")
        assert b64 and isinstance(b64, str) and len(b64) > 100, (
            f"expected base64 image payload, got keys={list(asset.keys())}"
        )

        # streak_event shape
        se = j["streak_event"]
        assert isinstance(se, dict)
        for k in ("count", "extended", "is_milestone"):
            assert k in se, f"missing {k} in streak_event={se}"

        # surprise nullable; if present validate shape + bonus_credits behavior
        surprise = j["surprise"]
        if surprise is not None:
            for k in ("type", "title", "desc", "reward"):
                assert k in surprise, f"missing {k} in surprise={surprise}"
            assert surprise["type"] in ("credit", "style", "boost", "praise"), surprise
            if surprise["type"] in ("credit", "boost"):
                after = requests.get(f"{API}/usage", headers=H(token), timeout=15).json()
                bc_after = after.get("bonus_credits", 0)
                assert bc_after == bc_before + 1, (
                    f"credit/boost should +1 bonus_credits: before={bc_before} after={bc_after}"
                )


# --------------------- Regression: /api/usage, /api/brand-memory, /api/analytics ---------------------
class TestRegressionEndpoints:
    def test_usage_endpoint(self):
        token, _ = _register("regusage")
        r = requests.get(f"{API}/usage", headers=H(token), timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        # Actual /api/usage fields
        for k in ("plan", "generations_used", "generations_limit", "bonus_credits",
                  "counters", "streak", "unlocked", "milestones"):
            assert k in j, f"missing {k} in usage={list(j.keys())}"
        assert isinstance(j["generations_used"], int)
        assert isinstance(j["generations_limit"], int)

    def test_brand_memory_endpoint_defaults(self):
        token, _ = _register("regmem")
        r = requests.get(f"{API}/brand-memory", headers=H(token), timeout=15)
        assert r.status_code == 200, r.text
        mem = r.json().get("brand_memory")
        assert isinstance(mem, dict)
        for k in ("enabled", "tone", "keywords", "colors"):
            assert k in mem
        assert mem["enabled"] is True

    def test_analytics_endpoint(self):
        token, _ = _register("reganl")
        r = requests.get(f"{API}/analytics", headers=H(token), timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert isinstance(j, dict) and len(j) > 0, f"analytics empty: {j}"

    def test_brand_memory_learns_from_project(self):
        token, _ = _register("reglearn")
        pr = requests.post(f"{API}/projects", json={
            "title": "TEST_reg_learn",
            "summary": "s", "pitch": "p", "tasks": [],
            "brand_keywords": ["cozy", "warm"],
            "source_idea": "regression learning",
        }, headers=H(token), timeout=30)
        assert pr.status_code == 200, pr.text
        mem = requests.get(f"{API}/brand-memory", headers=H(token), timeout=15).json()["brand_memory"]
        assert "cozy" in mem["keywords"] and "warm" in mem["keywords"], mem
