"""CreatorForge iteration 6 tests — Native IAP + Asset Version History.

Covers:
  * GET /api/payments/iap/products returns pro.monthly->monthly $14.99, pro.yearly->yearly $149.
  * POST /api/payments/iap/verify:
      - unknown product_id -> 400
      - ios missing receipt -> 400
      - ios with dummy receipt -> 503 (APPLE_SHARED_SECRET empty)
      - android without purchase_token -> 400
  * Asset version history (throwaway account, uses 1 image gen + 1 regenerate = 2 total):
      - POST /api/assets/generate creates asset with versions=[]
      - GET /api/assets/{id}/versions returns {current, versions: []}
      - POST /api/assets/{id}/regenerate returns {asset, streak_event, surprise?}, versions len == 1
      - GET /api/assets/{id}/versions shows current + 1 version
      - POST /api/assets/{id}/revert swaps current/previous
  * Regression: GET /api/usage, /api/projects, /api/brand-kits still authenticated + expected shapes.
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


def _register(prefix="iter6"):
    email = f"tester+{prefix}_{uuid.uuid4().hex[:8]}@creatorforge.app"
    r = requests.post(
        f"{API}/auth/register",
        json={"email": email, "password": "pw12345", "name": "Iter6 Tester"},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    return r.json()["token"], email


def _demo_token():
    r = requests.post(
        f"{API}/auth/login",
        json={"email": "demo@creatorforge.app", "password": "creator123"},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    return r.json()["token"]


# --------------------- IAP products ---------------------
class TestIapProducts:
    def test_products_returns_monthly_and_yearly(self):
        r = requests.get(f"{API}/payments/iap/products", timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "products" in j and isinstance(j["products"], list)
        products = j["products"]
        assert len(products) == 2, f"expected 2 products, got {products}"
        by_pid = {p["product_id"]: p for p in products}
        assert "pro.monthly" in by_pid and "pro.yearly" in by_pid
        m = by_pid["pro.monthly"]
        assert m["plan"] == "monthly"
        assert m["amount"] == 14.99, f"monthly amount {m['amount']}"
        y = by_pid["pro.yearly"]
        assert y["plan"] == "yearly"
        assert y["amount"] == 149 or y["amount"] == 149.00, f"yearly amount {y['amount']}"


# --------------------- IAP verify (error paths) ---------------------
class TestIapVerifyErrors:
    def test_verify_requires_auth(self):
        r = requests.post(
            f"{API}/payments/iap/verify",
            json={"platform": "ios", "product_id": "pro.monthly", "receipt": "x"},
            timeout=15,
        )
        assert r.status_code in (401, 403), r.text

    def test_unknown_product_returns_400(self):
        tok, _ = _register("iapunk")
        r = requests.post(
            f"{API}/payments/iap/verify",
            json={"platform": "ios", "product_id": "nope.unknown", "receipt": "x"},
            headers=H(tok),
            timeout=15,
        )
        assert r.status_code == 400, r.text

    def test_ios_missing_receipt_returns_400(self):
        tok, _ = _register("iapios1")
        r = requests.post(
            f"{API}/payments/iap/verify",
            json={"platform": "ios", "product_id": "pro.monthly"},
            headers=H(tok),
            timeout=15,
        )
        assert r.status_code == 400, r.text
        assert "receipt" in r.text.lower()

    def test_ios_with_dummy_receipt_returns_503_not_configured(self):
        tok, _ = _register("iapios2")
        r = requests.post(
            f"{API}/payments/iap/verify",
            json={"platform": "ios", "product_id": "pro.monthly", "receipt": "dummy"},
            headers=H(tok),
            timeout=20,
        )
        # APPLE_SHARED_SECRET is empty -> apple_not_configured -> 503
        assert r.status_code == 503, r.text
        assert "not_configured" in r.text.lower() or "configured" in r.text.lower()

    def test_android_missing_purchase_token_returns_400(self):
        tok, _ = _register("iapdroid")
        r = requests.post(
            f"{API}/payments/iap/verify",
            json={"platform": "android", "product_id": "pro.monthly"},
            headers=H(tok),
            timeout=15,
        )
        assert r.status_code == 400, r.text
        assert "purchase" in r.text.lower() or "token" in r.text.lower()


# --------------------- Asset version history (single throwaway, 2 image gens) ---------------------
class TestAssetVersionHistory:
    """Creates a throwaway account and consumes exactly 2 image generations."""

    def test_full_versions_regenerate_revert_flow(self):
        tok, _ = _register("assetver")

        # 1) Create project (no image gen).
        pr = requests.post(
            f"{API}/projects",
            json={
                "title": "TEST_ver_project",
                "summary": "s",
                "pitch": "p",
                "tasks": [],
                "brand_keywords": ["premium"],
                "source_idea": "asset versioning flow project",
            },
            headers=H(tok),
            timeout=30,
        )
        assert pr.status_code == 200, pr.text
        pid = pr.json()["project"]["id"]

        # 2) Brand kit (auto_generate uses Claude palette, no image gen).
        bk = requests.post(
            f"{API}/brand-kits",
            json={"project_id": pid, "name": "TEST_ver_kit", "auto_generate": True},
            headers=H(tok),
            timeout=90,
        )
        assert bk.status_code == 200, bk.text
        kit_id = bk.json()["brand_kit"]["id"]

        # 3) Generate ONE asset (image gen #1).
        gen = requests.post(
            f"{API}/assets/generate",
            json={
                "project_id": pid,
                "prompt": "hero visual for TEST_ver_project",
                "type": "social",
                "brand_kit_id": kit_id,
            },
            headers=H(tok),
            timeout=180,
        )
        assert gen.status_code == 200, gen.text
        asset = gen.json()["asset"]
        aid = asset["id"]
        assert asset.get("versions") in (None, [], []) or asset.get("versions") == []
        # versions may be missing (default) or empty list
        v_initial = asset.get("versions") or []
        assert v_initial == [], f"fresh asset should have no versions, got {v_initial}"

        # 4) GET /versions before any regeneration.
        vr = requests.get(f"{API}/assets/{aid}/versions", headers=H(tok), timeout=15)
        assert vr.status_code == 200, vr.text
        vj = vr.json()
        assert vj["asset_id"] == aid
        assert isinstance(vj["current"], dict)
        assert vj["current"].get("id") == "current"
        assert isinstance(vj["current"].get("image_b64"), str) and len(vj["current"]["image_b64"]) > 100
        assert vj["versions"] == [], f"expected empty versions initially, got {vj['versions']}"

        # 5) Regenerate (image gen #2).
        first_b64 = vj["current"]["image_b64"]
        rg = requests.post(
            f"{API}/assets/{aid}/regenerate",
            json={"prompt": "make it slightly more vibrant"},
            headers=H(tok),
            timeout=180,
        )
        assert rg.status_code == 200, rg.text
        rj = rg.json()
        # required response keys
        for k in ("asset", "newly_unlocked", "streak_event", "surprise"):
            assert k in rj, f"missing {k} in regenerate response keys={list(rj.keys())}"
        new_asset = rj["asset"]
        new_versions = new_asset.get("versions") or []
        assert len(new_versions) == 1, f"expected 1 version after 1 regen, got {len(new_versions)}"
        # the version stored should be the previous (i.e. the original first image).
        assert new_versions[0].get("image_b64") == first_b64, "prior image should be pushed to versions"
        # current image should be different (new base64).
        new_current_b64 = new_asset.get("image_b64")
        assert isinstance(new_current_b64, str) and len(new_current_b64) > 100
        # streak_event shape
        se = rj["streak_event"]
        assert isinstance(se, dict)
        for k in ("count", "extended", "is_milestone"):
            assert k in se

        # 6) GET /versions after regenerate.
        vr2 = requests.get(f"{API}/assets/{aid}/versions", headers=H(tok), timeout=15)
        assert vr2.status_code == 200, vr2.text
        vj2 = vr2.json()
        assert vj2["current"].get("image_b64") == new_current_b64
        assert len(vj2["versions"]) == 1
        version_id = vj2["versions"][0]["id"]
        assert isinstance(version_id, str) and version_id

        # 7) Revert to the previous version.
        rv = requests.post(
            f"{API}/assets/{aid}/revert",
            json={"version_id": version_id},
            headers=H(tok),
            timeout=30,
        )
        assert rv.status_code == 200, rv.text
        after = rv.json()["asset"]
        # After revert: current should be the original image again; versions should still have 1
        # entry (the previously-current image, i.e. new_current_b64).
        assert after.get("image_b64") == first_b64, "revert should restore the original image as current"
        aver = after.get("versions") or []
        assert len(aver) == 1, f"revert should keep 1 version (the outgoing), got {len(aver)}"
        assert aver[0].get("image_b64") == new_current_b64, "outgoing image should be pushed to history"

        # 8) Revert with unknown version_id -> 404.
        bad = requests.post(
            f"{API}/assets/{aid}/revert",
            json={"version_id": "does-not-exist"},
            headers=H(tok),
            timeout=15,
        )
        assert bad.status_code == 404, bad.text


# --------------------- Regression: /usage, /projects, /brand-kits ---------------------
class TestRegressionShapes:
    def test_usage_requires_auth_and_shape(self):
        # Unauthenticated -> 401/403
        r = requests.get(f"{API}/usage", timeout=10)
        assert r.status_code in (401, 403)
        # Authenticated
        tok = _demo_token()
        r2 = requests.get(f"{API}/usage", headers=H(tok), timeout=15)
        assert r2.status_code == 200, r2.text
        j = r2.json()
        for k in ("plan", "generations_used", "generations_limit", "bonus_credits",
                  "counters", "streak", "unlocked", "milestones"):
            assert k in j, f"missing {k} in usage keys={list(j.keys())}"

    def test_projects_requires_auth_and_shape(self):
        r = requests.get(f"{API}/projects", timeout=10)
        assert r.status_code in (401, 403)
        tok = _demo_token()
        r2 = requests.get(f"{API}/projects", headers=H(tok), timeout=15)
        assert r2.status_code == 200, r2.text
        j = r2.json()
        assert "projects" in j and isinstance(j["projects"], list)
        # Demo has 3 seeded projects.
        assert len(j["projects"]) >= 1
        p0 = j["projects"][0]
        for k in ("id", "title", "status"):
            assert k in p0, f"project missing {k}: {list(p0.keys())}"

    def test_brand_kits_requires_auth_and_shape(self):
        r = requests.get(f"{API}/brand-kits", timeout=10)
        assert r.status_code in (401, 403)
        tok = _demo_token()
        r2 = requests.get(f"{API}/brand-kits", headers=H(tok), timeout=15)
        assert r2.status_code == 200, r2.text
        j = r2.json()
        assert "brand_kits" in j and isinstance(j["brand_kits"], list)
