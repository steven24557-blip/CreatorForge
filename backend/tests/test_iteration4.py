"""CreatorForge iteration 4 tests — Smart Brand Memory + Idea->Brand Agent.

Covers:
  * GET/PATCH /api/brand-memory (defaults, caps at 12/8, tone/enabled toggle)
  * Learning from POST /api/projects (brand_keywords) and POST /api/brand-kits (auto colors + style_rules)
  * Enforcement: /api/ai/taglines and /api/ai/refine still work with memory populated
  * Full agent flow (run ONCE): refine -> project -> brand-kit(auto) -> taglines -> assets/generate
"""
import os
import time
import uuid
import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE:
    BASE = "https://brand-spark-12.preview.emergentagent.com"
API = f"{BASE}/api"


def H(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _register(prefix="mem"):
    email = f"tester+{prefix}_{uuid.uuid4().hex[:8]}@creatorforge.app"
    r = requests.post(f"{API}/auth/register",
                      json={"email": email, "password": "pw12345", "name": "Mem Tester"},
                      timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"], email


@pytest.fixture(scope="module")
def fresh_token():
    tok, _ = _register("bm")
    return tok


# --------------------- GET/PATCH /api/brand-memory ---------------------
class TestBrandMemoryEndpoints:
    def test_get_defaults_for_fresh_user(self):
        token, _ = _register("bmdef")
        r = requests.get(f"{API}/brand-memory", headers=H(token), timeout=15)
        assert r.status_code == 200, r.text
        mem = r.json().get("brand_memory")
        assert isinstance(mem, dict)
        for k in ("enabled", "tone", "keywords", "colors"):
            assert k in mem, f"missing {k} in {mem}"
        assert mem["enabled"] is True
        assert mem["tone"] == ""
        assert mem["keywords"] == []
        assert mem["colors"] == []

    def test_patch_updates_and_returns(self, fresh_token):
        payload = {
            "enabled": False,
            "tone": "playful and premium",
            "keywords": ["bold", "earthy", "modern"],
            "colors": ["#111111", "#222222"],
        }
        r = requests.patch(f"{API}/brand-memory", json=payload, headers=H(fresh_token), timeout=15)
        assert r.status_code == 200, r.text
        mem = r.json()["brand_memory"]
        assert mem["enabled"] is False
        assert mem["tone"] == "playful and premium"
        assert mem["keywords"] == ["bold", "earthy", "modern"]
        assert mem["colors"] == ["#111111", "#222222"]

        # GET reflects saved values
        g = requests.get(f"{API}/brand-memory", headers=H(fresh_token), timeout=15).json()["brand_memory"]
        assert g["enabled"] is False
        assert g["tone"] == "playful and premium"
        assert g["keywords"] == ["bold", "earthy", "modern"]

        # re-enable for enforcement tests
        requests.patch(f"{API}/brand-memory", json={"enabled": True}, headers=H(fresh_token), timeout=15)

    def test_patch_caps_keywords_at_12_and_colors_at_8(self):
        token, _ = _register("bmcap")
        big_kw = [f"kw{i}" for i in range(20)]
        big_colors = [f"#0000{i:02d}" for i in range(15)]
        r = requests.patch(f"{API}/brand-memory",
                           json={"keywords": big_kw, "colors": big_colors},
                           headers=H(token), timeout=15)
        assert r.status_code == 200, r.text
        mem = r.json()["brand_memory"]
        assert len(mem["keywords"]) == 12, f"expected 12 got {len(mem['keywords'])}"
        assert len(mem["colors"]) == 8, f"expected 8 got {len(mem['colors'])}"

    def test_requires_auth(self):
        r1 = requests.get(f"{API}/brand-memory", timeout=15)
        r2 = requests.patch(f"{API}/brand-memory", json={"tone": "x"}, timeout=15)
        assert r1.status_code in (401, 403)
        assert r2.status_code in (401, 403)


# --------------------- Learning from projects + brand kits ---------------------
class TestBrandMemoryLearning:
    def test_project_creation_learns_keywords_most_recent_first(self):
        token, _ = _register("bmlearn")
        # Create project with two brand_keywords
        pr = requests.post(f"{API}/projects", json={
            "title": "TEST_learning_project",
            "summary": "s", "pitch": "p", "tasks": [],
            "brand_keywords": ["premium", "earthy"],
            "source_idea": "learning memory test"
        }, headers=H(token), timeout=30)
        assert pr.status_code == 200, pr.text

        mem = requests.get(f"{API}/brand-memory", headers=H(token), timeout=15).json()["brand_memory"]
        # Both keywords learned
        assert "premium" in mem["keywords"], mem
        assert "earthy" in mem["keywords"], mem

        # Insert new keyword via another project -> most-recent-first
        pr2 = requests.post(f"{API}/projects", json={
            "title": "TEST_learning_project2",
            "summary": "s", "pitch": "p", "tasks": [],
            "brand_keywords": ["luxury"],
            "source_idea": "second project"
        }, headers=H(token), timeout=30)
        assert pr2.status_code == 200
        mem2 = requests.get(f"{API}/brand-memory", headers=H(token), timeout=15).json()["brand_memory"]
        assert mem2["keywords"][0] == "luxury", f"expected luxury first, got {mem2['keywords']}"

    def test_brand_kit_auto_learns_colors_and_rules(self):
        """Consumes 1 Claude palette generation (allowed per review request)."""
        token, _ = _register("bmkit")
        # Create a project first
        pr = requests.post(f"{API}/projects", json={
            "title": "TEST_bk_learning",
            "summary": "s", "pitch": "p", "tasks": [],
            "brand_keywords": ["minimal"],
            "source_idea": "kit learning"
        }, headers=H(token), timeout=30)
        assert pr.status_code == 200
        pid = pr.json()["project"]["id"]

        # Auto-generate palette (Claude)
        bk = requests.post(f"{API}/brand-kits", json={
            "project_id": pid,
            "name": "TEST_learn_kit",
            "auto_generate": True,
        }, headers=H(token), timeout=90)
        assert bk.status_code == 200, bk.text
        kit = bk.json()["brand_kit"]
        assert isinstance(kit.get("colors"), list) and len(kit["colors"]) >= 3

        # Memory should now have those colors
        mem = requests.get(f"{API}/brand-memory", headers=H(token), timeout=15).json()["brand_memory"]
        assert len(mem["colors"]) >= 1, f"expected colors learned, got {mem}"
        # At least one kit color should be present in memory
        overlap = set(c.lower() for c in kit["colors"]) & set(c.lower() for c in mem["colors"])
        assert overlap, f"no overlap between kit colors {kit['colors']} and memory {mem['colors']}"


# --------------------- Enforcement: generation still works ---------------------
class TestBrandMemoryEnforcement:
    def test_taglines_and_refine_still_work_with_memory(self, fresh_token):
        # Ensure memory populated
        requests.patch(f"{API}/brand-memory",
                       json={"enabled": True, "tone": "friendly", "keywords": ["bold", "warm"]},
                       headers=H(fresh_token), timeout=15)

        tg = requests.post(f"{API}/ai/taglines",
                           json={"context": "eco-friendly coffee subscription"},
                           headers=H(fresh_token), timeout=60)
        assert tg.status_code == 200, tg.text
        taglines = tg.json().get("taglines")
        assert isinstance(taglines, list) and len(taglines) >= 1

        rf = requests.post(f"{API}/ai/refine",
                           json={"raw_idea": "an app that helps creators plan content", "mode": "pitch"},
                           headers=H(fresh_token), timeout=60)
        assert rf.status_code == 200, rf.text
        rj = rf.json()
        # refine returns structured JSON with expected keys
        assert any(k in rj for k in ("title", "summary", "pitch", "tasks", "brand_keywords")), rj


# --------------------- Full Idea->Brand Agent flow (RUN ONCE, costs 1 image) ---------------------
class TestFullAgentFlow:
    def test_full_agent_end_to_end_once(self):
        """Runs refine -> project -> brand-kit -> taglines -> assets/generate ONCE."""
        token, _ = _register("agent")

        # 1) Refine
        rf = requests.post(f"{API}/ai/refine",
                           json={"raw_idea": "premium earthy candles for calm homes", "mode": "pitch"},
                           headers=H(token), timeout=60)
        assert rf.status_code == 200, rf.text
        refined = rf.json()

        # 2) Create project from refined
        proj_body = {
            "title": refined.get("title") or "TEST_agent_project",
            "summary": refined.get("summary") or "s",
            "pitch": refined.get("pitch") or "p",
            "tasks": refined.get("tasks") or [],
            "brand_keywords": refined.get("brand_keywords") or ["premium", "earthy"],
            "source_idea": "premium earthy candles for calm homes",
        }
        pr = requests.post(f"{API}/projects", json=proj_body, headers=H(token), timeout=30)
        assert pr.status_code == 200, pr.text
        pid = pr.json()["project"]["id"]

        # 3) Brand kit (auto)
        bk = requests.post(f"{API}/brand-kits", json={
            "project_id": pid, "name": proj_body["title"] + " kit", "auto_generate": True
        }, headers=H(token), timeout=90)
        assert bk.status_code == 200, bk.text
        kit = bk.json()["brand_kit"]
        assert isinstance(kit.get("colors"), list) and len(kit["colors"]) >= 3

        # 4) Taglines
        tg = requests.post(f"{API}/ai/taglines",
                           json={"context": proj_body["summary"] or proj_body["title"]},
                           headers=H(token), timeout=60)
        assert tg.status_code == 200, tg.text
        assert isinstance(tg.json().get("taglines"), list)

        # 5) Generate hero visual (COSTS 1 image; RUN ONCE)
        gen = requests.post(f"{API}/assets/generate", json={
            "project_id": pid,
            "prompt": f"hero visual for {proj_body['title']}",
            "type": "social",
            "brand_kit_id": kit["id"],
        }, headers=H(token), timeout=120)
        assert gen.status_code == 200, gen.text
        j = gen.json()
        asset = j.get("asset") or {}
        b64 = asset.get("image_b64") or asset.get("base64")
        assert b64 and isinstance(b64, str) and len(b64) > 100, (
            f"expected base64 image payload, got keys={list(asset.keys())}"
        )
