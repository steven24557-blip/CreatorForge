"""CreatorForge iteration 7 tests — Phase A "delight & hooks" polish.

Focus:
  * PATCH /api/brand-memory accepts {colors:[hex..], tone:'Warm & Artisanal'}
    (backing the Apply-vibe button on /agent) and returns updated brand_memory.
  * GET /api/brand-memory still returns {enabled, tone, keywords, colors} (regression).
  * Auth-gate: PATCH and GET require JWT.

Uses a THROWAWAY account for mutating tests so demo state is untouched, and
does read-only shape checks on the demo account.
"""
import os
import uuid
import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE:
    BASE = "https://brand-spark-12.preview.emergentagent.com"
API = f"{BASE}/api"

DEMO_EMAIL = "demo@creatorforge.app"
DEMO_PASSWORD = "creator123"


def H(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def throwaway_token():
    email = f"tester+iter7_{uuid.uuid4().hex[:8]}@creatorforge.app"
    r = requests.post(
        f"{API}/auth/register",
        json={"email": email, "password": "pw12345", "name": "Iter7 Tester"},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert "token" in data, data
    return data["token"]


@pytest.fixture(scope="module")
def demo_token():
    r = requests.post(
        f"{API}/auth/login",
        json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD},
        timeout=30,
    )
    if r.status_code != 200:
        pytest.skip(f"Demo login failed: {r.status_code} {r.text}")
    return r.json()["token"]


# ---------- Auth gating ----------
class TestBrandMemoryAuth:
    def test_get_brand_memory_requires_auth(self):
        r = requests.get(f"{API}/brand-memory", timeout=15)
        assert r.status_code == 401, r.text

    def test_patch_brand_memory_requires_auth(self):
        r = requests.patch(
            f"{API}/brand-memory",
            json={"colors": ["#D98E3A"], "tone": "Warm & Artisanal"},
            timeout=15,
        )
        assert r.status_code == 401, r.text


# ---------- Regression: GET shape ----------
class TestBrandMemoryShape:
    def test_get_brand_memory_shape_demo(self, demo_token):
        r = requests.get(f"{API}/brand-memory", headers=H(demo_token), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "brand_memory" in body
        mem = body["brand_memory"]
        # Required keys
        for key in ("enabled", "tone", "keywords", "colors"):
            assert key in mem, f"missing key {key} in {mem}"
        assert isinstance(mem["enabled"], bool)
        assert isinstance(mem["tone"], str)
        assert isinstance(mem["keywords"], list)
        assert isinstance(mem["colors"], list)

    def test_get_brand_memory_shape_throwaway(self, throwaway_token):
        r = requests.get(f"{API}/brand-memory", headers=H(throwaway_token), timeout=15)
        assert r.status_code == 200, r.text
        mem = r.json()["brand_memory"]
        # A freshly-registered user should have defaults
        assert mem["enabled"] is True
        assert mem["tone"] == ""
        assert mem["keywords"] == []
        assert mem["colors"] == []


# ---------- Apply-vibe path (PATCH) on THROWAWAY account ----------
class TestApplyVibePatch:
    """PATCH accepts colors+tone (as sent by app/agent.tsx applyVibe)."""

    WARM_PALETTE = ["#D98E3A", "#E4A46C", "#B8722C", "#F2C89A", "#8C5620"]
    WARM_TONE = "Warm & Artisanal"

    def test_patch_colors_and_tone_persists(self, throwaway_token):
        # Patch
        r = requests.patch(
            f"{API}/brand-memory",
            headers=H(throwaway_token),
            json={"colors": self.WARM_PALETTE, "tone": self.WARM_TONE},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        mem = r.json()["brand_memory"]
        assert mem["tone"] == self.WARM_TONE
        assert mem["colors"] == self.WARM_PALETTE
        # Untouched fields remain sane
        assert mem["enabled"] is True
        assert isinstance(mem["keywords"], list)

        # Verify persistence via GET
        r2 = requests.get(f"{API}/brand-memory", headers=H(throwaway_token), timeout=15)
        assert r2.status_code == 200, r2.text
        mem2 = r2.json()["brand_memory"]
        assert mem2["tone"] == self.WARM_TONE
        assert mem2["colors"] == self.WARM_PALETTE

    def test_patch_second_vibe_overwrites_colors_tone(self, throwaway_token):
        new_palette = ["#3B7A57", "#5A9D77", "#264F3A"]
        new_tone = "Natural & Grounded"
        r = requests.patch(
            f"{API}/brand-memory",
            headers=H(throwaway_token),
            json={"colors": new_palette, "tone": new_tone},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        mem = r.json()["brand_memory"]
        assert mem["tone"] == new_tone
        assert mem["colors"] == new_palette

    def test_patch_caps_colors_to_8(self, throwaway_token):
        # Server should truncate to <=8 colors (per server.py logic)
        long = [f"#{i:06x}" for i in range(12)]
        r = requests.patch(
            f"{API}/brand-memory",
            headers=H(throwaway_token),
            json={"colors": long},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        mem = r.json()["brand_memory"]
        assert len(mem["colors"]) <= 8

    def test_patch_caps_tone_to_60(self, throwaway_token):
        long_tone = "A" * 200
        r = requests.patch(
            f"{API}/brand-memory",
            headers=H(throwaway_token),
            json={"tone": long_tone},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        mem = r.json()["brand_memory"]
        assert len(mem["tone"]) <= 60

    def test_patch_partial_body_leaves_other_fields(self, throwaway_token):
        # First set a known state
        requests.patch(
            f"{API}/brand-memory",
            headers=H(throwaway_token),
            json={"colors": ["#111111"], "tone": "Test Tone", "keywords": ["kw1"]},
            timeout=20,
        )
        # Now patch only tone
        r = requests.patch(
            f"{API}/brand-memory",
            headers=H(throwaway_token),
            json={"tone": "Only Tone Update"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        mem = r.json()["brand_memory"]
        assert mem["tone"] == "Only Tone Update"
        assert mem["colors"] == ["#111111"]  # untouched
        assert mem["keywords"] == ["kw1"]  # untouched
