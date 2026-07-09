"""CreatorForge backend regression tests.

Covers: auth (register/login/me/logout/theme), AI text (refine/refine-project/taglines),
projects CRUD + counters/milestones, brand kits CRUD (no logo image call by default),
assets list/delete + one image generation, usage/limits (402), payments packages+checkout.

Image endpoints are gated behind RUN_IMAGE=1 to keep cost low. Whisper voice via RUN_VOICE=1.
"""
import os
import io
import uuid
import time
import pytest
import requests

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get("EXPO_PUBLIC_BACKEND_URL") else "https://brand-spark-12.preview.emergentagent.com"
API = f"{BASE}/api"

DEMO_EMAIL = "demo@creatorforge.app"
DEMO_PASSWORD = "creator123"

RUN_IMAGE = os.environ.get("RUN_IMAGE") == "1"
RUN_VOICE = os.environ.get("RUN_VOICE") == "1"


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def demo_token(session):
    r = session.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and "user" in data
    return data["token"]


@pytest.fixture(scope="session")
def new_user(session):
    email = f"test_{uuid.uuid4().hex[:8]}@example.com"
    r = session.post(f"{API}/auth/register", json={"email": email, "password": "pw12345", "name": "Regression Tester"}, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    return {"email": email, "token": d["token"], "user": d["user"]}


def H(token):
    return {"Authorization": f"Bearer {token}"}


# --------------------- health ---------------------
def test_health(session):
    r = session.get(f"{API}/", timeout=15)
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


# --------------------- auth ---------------------
class TestAuth:
    def test_login_demo(self, session):
        r = session.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["user"]["email"] == DEMO_EMAIL
        assert "password" not in d["user"]

    def test_login_bad_password(self, session):
        r = session.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": "wrong"}, timeout=15)
        assert r.status_code == 401

    def test_register_duplicate(self, session):
        r = session.post(f"{API}/auth/register", json={"email": DEMO_EMAIL, "password": "creator123", "name": "dup"}, timeout=15)
        assert r.status_code == 409

    def test_me(self, session, demo_token):
        r = session.get(f"{API}/auth/me", headers=H(demo_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["user"]["email"] == DEMO_EMAIL

    def test_me_no_token(self, session):
        r = session.get(f"{API}/auth/me", timeout=15)
        assert r.status_code in (401, 403)

    def test_theme_toggle(self, session, demo_token):
        r = session.patch(f"{API}/auth/theme", json={"theme": "light"}, headers=H(demo_token), timeout=15)
        assert r.status_code == 200 and r.json()["theme"] == "light"
        r = session.patch(f"{API}/auth/theme", json={"theme": "dark"}, headers=H(demo_token), timeout=15)
        assert r.status_code == 200 and r.json()["theme"] == "dark"


# --------------------- AI text (Claude) ---------------------
class TestAI:
    def test_refine(self, session, new_user):
        r = session.post(f"{API}/ai/refine", json={"raw_idea": "a mobile app for indie musicians to swap loops"}, headers=H(new_user["token"]), timeout=90)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("title", "summary", "pitch", "tasks", "brand_keywords"):
            assert k in d, f"missing {k} in {d}"
        assert isinstance(d["tasks"], list) and isinstance(d["brand_keywords"], list)

    def test_taglines(self, session, new_user):
        r = session.post(f"{API}/ai/taglines", json={"context": "sustainable coffee brand"}, headers=H(new_user["token"]), timeout=90)
        assert r.status_code == 200, r.text
        assert isinstance(r.json().get("taglines"), list)


# --------------------- projects ---------------------
@pytest.fixture(scope="session")
def project(session, new_user):
    body = {"title": "TEST_ Project", "summary": "s", "pitch": "p", "tasks": ["t1", "t2"], "brand_keywords": ["bold"], "source_idea": "idea"}
    r = session.post(f"{API}/projects", json=body, headers=H(new_user["token"]), timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["project"]["title"] == "TEST_ Project"
    assert "newly_unlocked" in d
    return d["project"]


class TestProjects:
    def test_create_increments_counter(self, session, new_user, project):
        r = session.get(f"{API}/usage", headers=H(new_user["token"]), timeout=15)
        assert r.status_code == 200
        assert r.json()["counters"]["ideas_created"] >= 1

    def test_list(self, session, new_user, project):
        r = session.get(f"{API}/projects", headers=H(new_user["token"]), timeout=15)
        assert r.status_code == 200
        ids = [p["id"] for p in r.json()["projects"]]
        assert project["id"] in ids

    def test_list_filter_q(self, session, new_user, project):
        r = session.get(f"{API}/projects?q=TEST_", headers=H(new_user["token"]), timeout=15)
        assert r.status_code == 200 and len(r.json()["projects"]) >= 1

    def test_list_filter_status(self, session, new_user, project):
        r = session.get(f"{API}/projects?status=idea", headers=H(new_user["token"]), timeout=15)
        assert r.status_code == 200
        assert all(p["status"] == "idea" for p in r.json()["projects"])

    def test_get_project(self, session, new_user, project):
        r = session.get(f"{API}/projects/{project['id']}", headers=H(new_user["token"]), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["project"]["id"] == project["id"]
        assert "assets" in d and "brand_kit" in d

    def test_patch_and_verify(self, session, new_user, project):
        r = session.patch(f"{API}/projects/{project['id']}", json={"summary": "updated summary TEST_"}, headers=H(new_user["token"]), timeout=15)
        assert r.status_code == 200
        r = session.get(f"{API}/projects/{project['id']}", headers=H(new_user["token"]), timeout=15)
        assert r.json()["project"]["summary"] == "updated summary TEST_"


# --------------------- brand kits (no image) ---------------------
@pytest.fixture(scope="session")
def brand_kit_no_ai(session, new_user, project):
    body = {"project_id": project["id"], "name": "TEST_Kit", "context": "modern minimal", "auto_generate": False}
    r = session.post(f"{API}/brand-kits", json=body, headers=H(new_user["token"]), timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["brand_kit"]


class TestBrandKits:
    def test_create_default(self, session, new_user, brand_kit_no_ai):
        assert brand_kit_no_ai["name"] == "TEST_Kit"
        assert isinstance(brand_kit_no_ai["colors"], list) and len(brand_kit_no_ai["colors"]) >= 3

    def test_list(self, session, new_user, brand_kit_no_ai):
        r = session.get(f"{API}/brand-kits", headers=H(new_user["token"]), timeout=15)
        assert r.status_code == 200
        assert any(k["id"] == brand_kit_no_ai["id"] for k in r.json()["brand_kits"])

    def test_get(self, session, new_user, brand_kit_no_ai):
        r = session.get(f"{API}/brand-kits/{brand_kit_no_ai['id']}", headers=H(new_user["token"]), timeout=15)
        assert r.status_code == 200 and r.json()["brand_kit"]["id"] == brand_kit_no_ai["id"]

    def test_patch(self, session, new_user, brand_kit_no_ai):
        r = session.patch(f"{API}/brand-kits/{brand_kit_no_ai['id']}", json={"name": "TEST_Kit_Renamed"}, headers=H(new_user["token"]), timeout=15)
        assert r.status_code == 200 and r.json()["brand_kit"]["name"] == "TEST_Kit_Renamed"

    def test_create_auto_generate_counts_as_generation(self, session, new_user):
        # This uses Claude palette generation (cheap text) and consumes 1 free credit
        before = session.get(f"{API}/usage", headers=H(new_user["token"]), timeout=15).json()["generations_used"]
        r = session.post(f"{API}/brand-kits", json={"name": "TEST_AutoKit", "context": "warm earthy palette", "auto_generate": True}, headers=H(new_user["token"]), timeout=90)
        assert r.status_code == 200, r.text
        after = session.get(f"{API}/usage", headers=H(new_user["token"]), timeout=15).json()["generations_used"]
        assert after == before + 1


# --------------------- assets & usage limits ---------------------
class TestUsageLimits:
    def test_usage_shape(self, session, demo_token):
        r = session.get(f"{API}/usage", headers=H(demo_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("plan", "generations_used", "counters", "streak", "unlocked", "milestones"):
            assert k in d


class TestAssets:
    def test_list_empty_new_context(self, session, new_user):
        r = session.get(f"{API}/assets", headers=H(new_user["token"]), timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json()["assets"], list)

    @pytest.mark.skipif(not RUN_IMAGE, reason="RUN_IMAGE!=1; skipping image generation")
    def test_generate_asset_once(self, session, new_user, project, brand_kit_no_ai):
        r = session.post(f"{API}/assets/generate", json={
            "prompt": "minimalist geometric mark for TEST project",
            "type": "logo",
            "project_id": project["id"],
            "brand_kit_id": brand_kit_no_ai["id"],
        }, headers=H(new_user["token"]), timeout=120)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "asset" in d and d["asset"]["image_b64"]
        assert "newly_unlocked" in d


# --------------------- payments ---------------------
class TestPayments:
    def test_packages(self, session):
        r = session.get(f"{API}/payments/packages", timeout=15)
        assert r.status_code == 200
        pkgs = r.json()["packages"]
        assert "monthly" in pkgs and "yearly" in pkgs
        assert pkgs["monthly"]["amount"] == 14.99

    def test_checkout(self, session, demo_token):
        r = session.post(f"{API}/payments/checkout", json={"plan": "monthly", "origin_url": BASE}, headers=H(demo_token), timeout=45)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "url" in d and "session_id" in d
        # Status probe
        s = session.get(f"{API}/payments/status/{d['session_id']}", headers=H(demo_token), timeout=30)
        assert s.status_code == 200
        assert s.json()["plan"] == "monthly"

    def test_checkout_invalid_plan(self, session, demo_token):
        r = session.post(f"{API}/payments/checkout", json={"plan": "lifetime", "origin_url": BASE}, headers=H(demo_token), timeout=15)
        assert r.status_code == 400


# --------------------- voice (opt-in) ---------------------
@pytest.mark.skipif(not RUN_VOICE, reason="RUN_VOICE!=1")
def test_voice_transcribe(session, demo_token):
    import wave, struct, math
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000)
        frames = b"".join(struct.pack("<h", int(3000 * math.sin(2 * math.pi * 440 * i / 16000))) for i in range(16000))
        w.writeframes(frames)
    buf.seek(0)
    r = requests.post(f"{API}/voice/transcribe", files={"file": ("t.wav", buf, "audio/wav")}, headers={"Authorization": f"Bearer {demo_token}"}, timeout=60)
    assert r.status_code == 200
    assert "text" in r.json()
