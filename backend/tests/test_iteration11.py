"""
Iteration 11 — AI Product Packaging Preview
Endpoint: POST /api/assets/packaging

CRITICAL constraints (from review request):
- Exactly ONE Gemini image generation happens in this whole suite (happy path).
- The 2nd packaging call must 402 (no generation).
- We MUST toggle beta_premium_enabled=false to observe the FREE 1/day limit,
  and RESTORE it to true at the end (autouse module fixture ensures restore).
"""

import os
import time
import uuid
import pytest
import requests


def _load_env_file(path: str) -> dict:
    out = {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                out[k.strip()] = v.strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    return out


_FRONTEND_ENV = _load_env_file("/app/frontend/.env")
_BACKEND_ENV = _load_env_file("/app/backend/.env")

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("EXPO_BACKEND_URL")
    or _FRONTEND_ENV.get("EXPO_PUBLIC_BACKEND_URL")
    or _FRONTEND_ENV.get("EXPO_BACKEND_URL")
    or ""
).rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL not found — cannot run tests"

ADMIN_KEY = os.environ.get("ADMIN_API_KEY") or _BACKEND_ENV.get("ADMIN_API_KEY") or ""
assert ADMIN_KEY, "ADMIN_API_KEY not found — cannot toggle feature flags"

# 1x1 transparent PNG (valid PNG bytes) as base64
TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


# ---------------- module-level flag mgmt ----------------
@pytest.fixture(scope="module", autouse=True)
def flag_guard():
    """Force beta_premium_enabled=false during this module; restore original at teardown."""
    # snapshot
    r = requests.get(
        f"{BASE_URL}/api/admin/feature-flags", headers={"X-Admin-Key": ADMIN_KEY}, timeout=15
    )
    assert r.status_code == 200, f"admin GET failed: {r.status_code} {r.text}"
    original = r.json().get("flags", {})
    print(f"[flags-before] {original}")

    # flip to disable beta premium so FREE tier applies
    p = requests.patch(
        f"{BASE_URL}/api/admin/feature-flags",
        headers={"X-Admin-Key": ADMIN_KEY, "Content-Type": "application/json"},
        json={"beta_premium_enabled": False},
        timeout=15,
    )
    assert p.status_code == 200, f"admin PATCH failed: {p.status_code} {p.text}"
    # give the flag TTL cache time to refresh on any pod
    time.sleep(1.5)
    print(f"[flags-during] {p.json().get('flags')}")

    yield

    # RESTORE original flags — critical
    restore = {
        "beta_premium_enabled": bool(original.get("beta_premium_enabled", True)),
        "demo_account_visible": bool(original.get("demo_account_visible", False)),
        "allow_new_signups": bool(original.get("allow_new_signups", True)),
    }
    rr = requests.patch(
        f"{BASE_URL}/api/admin/feature-flags",
        headers={"X-Admin-Key": ADMIN_KEY, "Content-Type": "application/json"},
        json=restore,
        timeout=15,
    )
    print(f"[flags-restored] {rr.status_code} {rr.text}")


# ---------------- shared test session ----------------
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def free_user(session):
    """Register a throwaway FREE account after the flag_guard flipped beta_premium off."""
    email = f"TEST_pkg_{uuid.uuid4().hex[:10]}@example.com"
    r = session.post(
        f"{BASE_URL}/api/auth/register",
        json={"email": email, "password": "TestPass123!", "name": "Pkg Tester"},
        timeout=20,
    )
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    token = data["token"]
    user = data["user"]
    # sanity: because beta_premium is OFF, this user should NOT be premium in /api/usage
    u = session.get(
        f"{BASE_URL}/api/usage", headers={"Authorization": f"Bearer {token}"}, timeout=15
    )
    assert u.status_code == 200, f"/usage failed: {u.status_code} {u.text}"
    print(f"[free_user] {email} usage={u.json()}")
    return {"email": email, "token": token, "user": user, "auth": {"Authorization": f"Bearer {token}"}}


@pytest.fixture(scope="module")
def brand_kit(session, free_user):
    """Create a brand kit with auto_generate:false so NO image gen happens here."""
    r = session.post(
        f"{BASE_URL}/api/brand-kits",
        headers=free_user["auth"],
        json={
            "name": "TEST_PkgKit",
            "context": "minimalist skincare",
            "auto_generate": False,
            "colors": ["#0F0F0F", "#EAEAEA", "#C5A880", "#1C1C1C"],
            "fonts": {"heading": "Fraunces", "body": "Geist"},
            "style_rules": ["Keep it minimal", "High contrast"],
        },
        timeout=20,
    )
    assert r.status_code == 200, f"create brand kit failed: {r.status_code} {r.text}"
    k = r.json()["brand_kit"]
    assert k["id"] and k["name"] == "TEST_PkgKit"
    return k


# =============================================================
#  Validation tests (do NOT consume generations)
# =============================================================

def test_packaging_requires_auth(session, brand_kit):
    """No Authorization header → 401 (does not consume generation)."""
    r = session.post(
        f"{BASE_URL}/api/assets/packaging",
        json={"brand_kit_id": brand_kit["id"], "style": "box", "images": [TINY_PNG_B64]},
        timeout=15,
    )
    assert r.status_code == 401, f"expected 401, got {r.status_code} {r.text}"


def test_packaging_empty_images_returns_400(session, free_user, brand_kit):
    r = session.post(
        f"{BASE_URL}/api/assets/packaging",
        headers=free_user["auth"],
        json={"brand_kit_id": brand_kit["id"], "style": "box", "images": []},
        timeout=15,
    )
    assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text}"
    assert "Upload" in r.text or "image" in r.text.lower()


def test_packaging_unknown_brand_kit_returns_404(session, free_user):
    r = session.post(
        f"{BASE_URL}/api/assets/packaging",
        headers=free_user["auth"],
        json={"brand_kit_id": "does-not-exist-" + uuid.uuid4().hex, "style": "box", "images": [TINY_PNG_B64]},
        timeout=15,
    )
    assert r.status_code == 404, f"expected 404, got {r.status_code} {r.text}"


# =============================================================
#  Happy path — CONSUMES EXACTLY 1 Gemini image generation
# =============================================================

@pytest.fixture(scope="module")
def packaging_asset(session, free_user, brand_kit):
    r = session.post(
        f"{BASE_URL}/api/assets/packaging",
        headers=free_user["auth"],
        json={"brand_kit_id": brand_kit["id"], "style": "box", "images": [TINY_PNG_B64]},
        timeout=120,
    )
    assert r.status_code == 200, f"happy path failed: {r.status_code} {r.text}"
    body = r.json()
    assert "asset" in body
    a = body["asset"]
    assert a.get("type") == "packaging", f"unexpected type: {a.get('type')}"
    assert a.get("image_b64") and len(a["image_b64"]) > 100, "image_b64 missing or too small"
    assert a.get("brand_kit_id") == brand_kit["id"]
    assert a.get("id")
    assert "_id" not in a, "MongoDB _id must not leak"
    print(f"[happy] asset.id={a['id']} img_b64_len={len(a['image_b64'])}")
    return a


def test_packaging_happy_path(packaging_asset):
    # created by the fixture; assertions inside the fixture are the test
    assert packaging_asset["type"] == "packaging"


# =============================================================
#  Free-tier daily limit — 2nd call must 402 (no generation)
# =============================================================

def test_packaging_free_daily_limit_402(session, free_user, brand_kit, packaging_asset):
    r = session.post(
        f"{BASE_URL}/api/assets/packaging",
        headers=free_user["auth"],
        json={"brand_kit_id": brand_kit["id"], "style": "pouch", "images": [TINY_PNG_B64]},
        timeout=30,
    )
    assert r.status_code == 402, f"expected 402, got {r.status_code} {r.text}"
    assert "packaging" in r.text.lower() or "upgrade" in r.text.lower()


# =============================================================
#  Asset visibility + deletion
# =============================================================

def test_packaging_appears_in_assets_list(session, free_user, packaging_asset):
    r = session.get(
        f"{BASE_URL}/api/assets", headers=free_user["auth"], timeout=15
    )
    assert r.status_code == 200, r.text
    items = r.json().get("assets", [])
    ids = [a["id"] for a in items]
    assert packaging_asset["id"] in ids
    matched = [a for a in items if a["id"] == packaging_asset["id"]][0]
    assert matched["type"] == "packaging"


def test_packaging_appears_in_brand_kit_detail(session, free_user, brand_kit, packaging_asset):
    r = session.get(
        f"{BASE_URL}/api/brand-kits/{brand_kit['id']}",
        headers=free_user["auth"],
        timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["brand_kit"]["id"] == brand_kit["id"]
    assets = body.get("assets", [])
    ids = [a["id"] for a in assets]
    assert packaging_asset["id"] in ids, f"packaging asset not in brand-kit asset list: {ids}"
    match = [a for a in assets if a["id"] == packaging_asset["id"]][0]
    assert match["type"] == "packaging"


def test_packaging_asset_is_deletable(session, free_user, packaging_asset):
    r = session.delete(
        f"{BASE_URL}/api/assets/{packaging_asset['id']}",
        headers=free_user["auth"],
        timeout=15,
    )
    assert r.status_code == 200, r.text
    # verify gone
    g = session.get(
        f"{BASE_URL}/api/assets/{packaging_asset['id']}",
        headers=free_user["auth"],
        timeout=15,
    )
    assert g.status_code == 404


# =============================================================
#  Premium bypass — code-inspection ONLY (no gen).
# =============================================================

def test_premium_bypass_via_code_inspection():
    """Confirm check_and_count_packaging short-circuits for premium (no additional gen consumed)."""
    with open("/app/backend/server.py", "r", encoding="utf-8") as f:
        src = f.read()
    # locate check_and_count_packaging
    idx = src.find("async def check_and_count_packaging")
    assert idx > 0, "check_and_count_packaging not found"
    body = src[idx: idx + 800]
    assert "is_premium(user)" in body, "premium bypass check missing"
    assert "return" in body.split("is_premium(user)")[1].splitlines()[0] or "return" in body.split("is_premium(user)")[1][:80], "no early return after is_premium check"
    # ensure FREE_DAILY_PACKAGING is 1
    assert "FREE_DAILY_PACKAGING = 1" in src, "FREE_DAILY_PACKAGING must equal 1"
