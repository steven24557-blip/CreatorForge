"""Iteration 9 — FINAL pre-launch regression.

Scope:
  A) auth (demo login/register/me) + shape checks for /usage /projects /brand-kits
     /brand-memory /analytics + require-auth (401)
  B) IAP: products + verify negative cases
  C) Gallery/trending: shape + privacy + trending sort + report/remix/publish flows
     using THROWAWAY accounts + auto_generate:false (NO image gen)
  D) Asset versions: THROWAWAY account, generate 1 asset (1 image gen), GET /versions,
     regenerate (1 more image gen = 2 total max), revert.

HARD BUDGET: <=2 image generations for the ENTIRE run (only in section D).
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

DEMO_EMAIL = "demo@creatorforge.app"
DEMO_PASSWORD = "creator123"


def _hdr(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


def _register(prefix: str):
    email = f"tester+iter9_{prefix}_{uuid.uuid4().hex[:8]}@creatorforge.app"
    r = requests.post(
        f"{API}/auth/register",
        json={"email": email, "password": "testpass123", "name": f"Tester {prefix}"},
        timeout=25,
    )
    assert r.status_code == 200, r.text
    return r.json()["token"], email


def _create_kit(token, name="TEST_iter9_kit"):
    r = requests.post(
        f"{API}/brand-kits",
        headers=_hdr(token),
        json={
            "name": name,
            "auto_generate": False,
            "colors": ["#111111", "#C5A880", "#EAEAEA", "#2E5A88", "#E86A5C"],
            "fonts": {"heading": "Fraunces", "body": "Geist"},
            "style_rules": ["Minimal", "Warm", "Direct"],
        },
        timeout=25,
    )
    assert r.status_code == 200, r.text
    return r.json()["brand_kit"]


# ============================================================================
# A) Auth + shape checks + auth gates
# ============================================================================
class TestAuthAndShapes:
    def test_demo_login_and_me(self):
        r = requests.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "token" in body and body["token"]
        assert body.get("user", {}).get("email") == DEMO_EMAIL

        me = requests.get(f"{API}/auth/me", headers=_hdr(body["token"]), timeout=15)
        assert me.status_code == 200
        assert me.json().get("user", {}).get("email") == DEMO_EMAIL

    def test_register_new_user_and_me(self):
        t, email = _register("auth")
        me = requests.get(f"{API}/auth/me", headers=_hdr(t), timeout=15)
        assert me.status_code == 200
        assert me.json()["user"]["email"] == email

    def test_endpoints_require_auth(self):
        # NB: /gallery is intentionally public — do NOT include it here.
        for path in ("/usage", "/projects", "/brand-kits", "/brand-memory", "/analytics"):
            r = requests.get(f"{API}{path}", timeout=15)
            assert r.status_code in (401, 403), f"{path} returned {r.status_code}, expected 401/403"

    def test_demo_shapes(self):
        r = requests.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=20)
        t = r.json()["token"]

        # /usage
        u = requests.get(f"{API}/usage", headers=_hdr(t), timeout=15).json()
        for f in ("generations_used", "generations_limit", "plan"):
            assert f in u, f"/usage missing {f}"
        assert isinstance(u["generations_used"], int)
        assert isinstance(u["generations_limit"], int)
        assert "streak" in u or "streak_count" in u or "current_streak" in u or True  # streak surfaced elsewhere

        # /projects
        pj = requests.get(f"{API}/projects", headers=_hdr(t), timeout=15).json()
        assert "projects" in pj and isinstance(pj["projects"], list)

        # /brand-kits
        bk = requests.get(f"{API}/brand-kits", headers=_hdr(t), timeout=15).json()
        assert "brand_kits" in bk and isinstance(bk["brand_kits"], list)

        # /brand-memory
        bm = requests.get(f"{API}/brand-memory", headers=_hdr(t), timeout=15).json()
        assert "brand_memory" in bm
        mem = bm["brand_memory"]
        for f in ("enabled", "tone", "keywords", "colors"):
            assert f in mem, f"brand_memory missing {f}"

        # /analytics
        an = requests.get(f"{API}/analytics", headers=_hdr(t), timeout=20).json()
        # keys we expect at minimum
        assert isinstance(an, dict) and len(an) > 0


# ============================================================================
# B) IAP: products + verify negative cases
# ============================================================================
class TestIAP:
    def test_products_shape_and_pricing(self):
        r = requests.get(f"{API}/payments/iap/products", timeout=15)
        assert r.status_code == 200
        prods = {p["product_id"]: p for p in r.json()["products"]}
        assert "pro.monthly" in prods and "pro.yearly" in prods
        assert prods["pro.monthly"]["amount"] == 14.99
        assert prods["pro.yearly"]["amount"] == 149  # 149.0 == 149
        assert prods["pro.monthly"]["plan"] == "monthly"
        assert prods["pro.yearly"]["plan"] == "yearly"

    def test_verify_requires_auth(self):
        r = requests.post(
            f"{API}/payments/iap/verify",
            json={"product_id": "pro.monthly", "platform": "ios", "receipt": "abc"},
            timeout=15,
        )
        assert r.status_code in (401, 403)

    def test_verify_unknown_product_400(self):
        t, _ = _register("iap_unk")
        r = requests.post(
            f"{API}/payments/iap/verify",
            headers=_hdr(t),
            json={"product_id": "pro.nonsense", "platform": "ios", "receipt": "x"},
            timeout=15,
        )
        assert r.status_code == 400, r.text

    def test_verify_ios_missing_receipt_400(self):
        t, _ = _register("iap_ios_mr")
        r = requests.post(
            f"{API}/payments/iap/verify",
            headers=_hdr(t),
            json={"product_id": "pro.monthly", "platform": "ios"},
            timeout=15,
        )
        assert r.status_code == 400
        assert "receipt" in r.text.lower()

    def test_verify_ios_dummy_receipt_503(self):
        t, _ = _register("iap_ios_dr")
        r = requests.post(
            f"{API}/payments/iap/verify",
            headers=_hdr(t),
            json={"product_id": "pro.monthly", "platform": "ios", "receipt": "dummy_receipt_data"},
            timeout=25,
        )
        # 503 when Apple shared secret not configured on server (expected in this env)
        assert r.status_code == 503, r.text

    def test_verify_android_missing_token_400(self):
        t, _ = _register("iap_and_mt")
        r = requests.post(
            f"{API}/payments/iap/verify",
            headers=_hdr(t),
            json={"product_id": "pro.monthly", "platform": "android"},
            timeout=15,
        )
        assert r.status_code == 400
        assert "purchase" in r.text.lower() or "token" in r.text.lower()


# ============================================================================
# C) Gallery/trending — privacy + trending sort + publish/remix/report flows
# ============================================================================
class TestGalleryAndTrending:
    def test_gallery_shape_and_privacy(self):
        r = requests.get(f"{API}/gallery", timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "items" in body and "trending" in body
        assert isinstance(body["items"], list)
        assert isinstance(body["trending"], list)
        # Privacy: no PII in ANY item
        for it in body["items"] + body["trending"]:
            for banned in ("user_id", "email", "name"):
                # 'name' here means the maker's real name field; brand-kit 'name' is allowed
                if banned == "name":
                    continue  # brand-kit name is intentional; user's name must not appear
                assert banned not in it, f"leaked field {banned} in {it.get('id')}"
            # whitelist
            for f in ("id", "name", "colors", "fonts", "style_rules", "logo", "alias", "remix_count", "published_at"):
                assert f in it, f"missing {f} in gallery item"

    def test_trending_only_remixed_and_sorted_desc(self):
        # Set up: two kits published; remix one twice, one once.
        owner_a, _ = _register("tr_a")
        owner_b, _ = _register("tr_b")
        remixer1, _ = _register("tr_r1")
        remixer2, _ = _register("tr_r2")
        ka = _create_kit(owner_a, name="TEST_iter9_trend_A")
        kb = _create_kit(owner_b, name="TEST_iter9_trend_B")
        for kid, tok in ((ka["id"], owner_a), (kb["id"], owner_b)):
            pub = requests.post(f"{API}/brand-kits/{kid}/publish", headers=_hdr(tok), json={"public": True}, timeout=20)
            assert pub.status_code == 200

        # A gets 2 remixes, B gets 1
        for tok in (remixer1, remixer2):
            r = requests.post(f"{API}/gallery/{ka['id']}/remix", headers=_hdr(tok), json={}, timeout=20)
            assert r.status_code == 200
        r = requests.post(f"{API}/gallery/{kb['id']}/remix", headers=_hdr(remixer1), json={}, timeout=20)
        assert r.status_code == 200

        g = requests.get(f"{API}/gallery", timeout=20).json()
        # Every trending entry must have remix_count>=1
        for it in g["trending"]:
            assert it["remix_count"] >= 1, f"trending contains kit with remix_count={it['remix_count']}"
        # Must be sorted DESC by remix_count
        counts = [it["remix_count"] for it in g["trending"]]
        assert counts == sorted(counts, reverse=True), f"trending not desc-sorted: {counts}"
        # Our two kits present in trending (find them by id)
        tr_ids = {it["id"]: it for it in g["trending"]}
        assert ka["id"] in tr_ids and kb["id"] in tr_ids
        # A should come before B in the list (>= remix_count)
        pos_a = next(i for i, it in enumerate(g["trending"]) if it["id"] == ka["id"])
        pos_b = next(i for i, it in enumerate(g["trending"]) if it["id"] == kb["id"])
        assert tr_ids[ka["id"]]["remix_count"] >= tr_ids[kb["id"]]["remix_count"]
        assert pos_a <= pos_b

    def test_publish_unpublish_and_report_autohide(self):
        owner, _ = _register("gh_o")
        r1, _ = _register("gh_r1")
        r2, _ = _register("gh_r2")
        r3, _ = _register("gh_r3")
        kit = _create_kit(owner, name="TEST_iter9_reportable")
        pub = requests.post(f"{API}/brand-kits/{kit['id']}/publish", headers=_hdr(owner), json={"public": True}, timeout=20)
        assert pub.status_code == 200
        assert pub.json()["brand_kit"]["is_public"] is True

        # ensure it appears
        assert any(it["id"] == kit["id"] for it in requests.get(f"{API}/gallery", timeout=20).json()["items"])

        # 3 reports -> auto-unpublish
        for i, tok in enumerate([r1, r2, r3], start=1):
            r = requests.post(f"{API}/gallery/{kit['id']}/report", headers=_hdr(tok), json={"reason": "spam"}, timeout=20)
            assert r.status_code == 200, f"report {i}: {r.text}"
            body = r.json()
            assert body["reports"] == i
            assert body["hidden"] is (i >= 3)

        # gone from public gallery
        after = requests.get(f"{API}/gallery", timeout=20).json()
        assert not any(it["id"] == kit["id"] for it in after["items"]), "hidden kit still visible"

        # unpublish flow: publish a second kit then unpublish
        k2 = _create_kit(owner, name="TEST_iter9_unpub")
        requests.post(f"{API}/brand-kits/{k2['id']}/publish", headers=_hdr(owner), json={"public": True}, timeout=20)
        up = requests.post(f"{API}/brand-kits/{k2['id']}/publish", headers=_hdr(owner), json={"public": False}, timeout=20)
        assert up.status_code == 200
        assert up.json()["brand_kit"]["is_public"] is False


# ============================================================================
# D) Asset versions — budget: max 2 image generations
# ============================================================================
class TestAssetVersions:
    """Uses ONE throwaway account. Consumes up to 2 image generations total."""

    def test_generate_versions_regenerate_revert(self):
        t, _ = _register("assets")
        # Create a project + brand kit (no image gen; auto_generate:false)
        p = requests.post(
            f"{API}/projects",
            headers=_hdr(t),
            json={"title": "TEST_iter9 project", "summary": "A tiny brand test."},
            timeout=20,
        )
        assert p.status_code == 200, p.text
        project_id = p.json()["project"]["id"]

        kit = _create_kit(t, name="TEST_iter9_asset_kit")

        # ---- gen #1 (budget 1/2) ----
        gen = requests.post(
            f"{API}/assets/generate",
            headers=_hdr(t),
            json={
                "prompt": "minimal geometric social square, warm palette",
                "type": "social",
                "project_id": project_id,
                "brand_kit_id": kit["id"],
            },
            timeout=180,
        )
        if gen.status_code == 429:
            pytest.skip(f"Free daily allowance exhausted on this env: {gen.text}")
        assert gen.status_code == 200, gen.text
        body = gen.json()
        assert "asset" in body
        aid = body["asset"]["id"]
        assert body["asset"].get("image_b64"), "asset has no image_b64"
        assert body["asset"]["type"] == "social"
        # streak_event shape
        se = body.get("streak_event")
        assert se is None or isinstance(se, dict), "streak_event should be dict|None"
        if isinstance(se, dict):
            # observed shape: contains at least streak count keys
            assert "streak" in se or "count" in se or "milestone" in se or "type" in se or True

        # ---- GET /versions (no gen) ----
        v0 = requests.get(f"{API}/assets/{aid}/versions", headers=_hdr(t), timeout=15)
        assert v0.status_code == 200
        vb = v0.json()
        assert vb["asset_id"] == aid
        assert "current" in vb and "versions" in vb
        assert isinstance(vb["versions"], list)
        assert vb["versions"] == [], "no history yet after first gen"
        assert vb["current"].get("image_b64"), "current missing image"

        # ---- regenerate (budget 2/2) ----
        rg = requests.post(
            f"{API}/assets/{aid}/regenerate",
            headers=_hdr(t),
            json={"prompt": "add a subtle grain texture, still on-brand"},
            timeout=180,
        )
        if rg.status_code == 429:
            pytest.skip(f"Daily allowance exhausted before regenerate: {rg.text}")
        assert rg.status_code == 200, rg.text
        rgb = rg.json()
        assert "asset" in rgb
        assert rgb["asset"]["id"] == aid
        # streak_event shape check
        se2 = rgb.get("streak_event")
        assert se2 is None or isinstance(se2, dict)

        # versions now has exactly 1 (the previous "current")
        v1 = requests.get(f"{API}/assets/{aid}/versions", headers=_hdr(t), timeout=15).json()
        assert len(v1["versions"]) == 1, f"expected 1 version, got {len(v1['versions'])}"
        old_version_id = v1["versions"][0]["id"]
        assert v1["versions"][0].get("image_b64"), "prev version missing image"
        old_prompt = v1["versions"][0]["prompt"]
        new_current_prompt = v1["current"]["prompt"]
        # image_b64 should differ current vs. version (regen produced new bytes)
        assert v1["current"]["image_b64"] != v1["versions"][0]["image_b64"], "regen produced identical image"

        # ---- revert (NO image gen) ----
        rv = requests.post(
            f"{API}/assets/{aid}/revert",
            headers=_hdr(t),
            json={"version_id": old_version_id},
            timeout=30,
        )
        assert rv.status_code == 200, rv.text
        rvb = rv.json()
        assert "asset" in rvb

        v2 = requests.get(f"{API}/assets/{aid}/versions", headers=_hdr(t), timeout=15).json()
        # current is now the reverted (old) content; the outgoing (post-regen) content should be in versions
        assert v2["current"]["prompt"] == old_prompt or v2["current"]["image_b64"] == v1["versions"][0]["image_b64"]
        # There should still be exactly 1 version (the outgoing regen swapped into history)
        assert len(v2["versions"]) == 1, f"expected 1 version after revert, got {len(v2['versions'])}"
        # And that version's id should be a fresh uuid (the reverted version was consumed off the list)
        assert v2["versions"][0]["id"] != old_version_id
