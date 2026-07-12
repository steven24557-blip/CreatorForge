"""Iteration 8 tests — community gallery: publish / gallery feed privacy / remix / report auto-hide."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


def _register(prefix: str):
    email = f"tester+iter8_{prefix}_{uuid.uuid4().hex[:8]}@creatorforge.app"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "testpass123", "name": f"Tester {prefix}"}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"], email


def _hdr(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


def _create_kit(token, name="TEST_Kit"):
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
        timeout=20,
    )
    assert r.status_code == 200, r.text
    return r.json()["brand_kit"]


# --- Publish endpoint --------------------------------------------------------
class TestPublish:
    def test_publish_toggle_and_default_alias(self):
        t, _ = _register("pub")
        kit = _create_kit(t, name="TEST_Publish Kit")
        kid = kit["id"]

        # publish with no alias -> default alias
        r = requests.post(f"{API}/brand-kits/{kid}/publish", headers=_hdr(t), json={"public": True}, timeout=20)
        assert r.status_code == 200, r.text
        k = r.json()["brand_kit"]
        assert k["is_public"] is True
        assert k["gallery_alias"] == "A CreatorForge maker"
        assert k.get("published_at")

        # unpublish
        r2 = requests.post(f"{API}/brand-kits/{kid}/publish", headers=_hdr(t), json={"public": False}, timeout=20)
        assert r2.status_code == 200
        assert r2.json()["brand_kit"]["is_public"] is False

    def test_publish_with_custom_alias(self):
        t, _ = _register("alias")
        kit = _create_kit(t, name="TEST_Alias Kit")
        r = requests.post(f"{API}/brand-kits/{kit['id']}/publish", headers=_hdr(t), json={"public": True, "alias": "AnonCreator"}, timeout=20)
        assert r.status_code == 200
        assert r.json()["brand_kit"]["gallery_alias"] == "AnonCreator"

    def test_non_owner_cannot_publish(self):
        owner, _ = _register("owner1")
        other, _ = _register("other1")
        kit = _create_kit(owner, name="TEST_OwnerOnly")
        r = requests.post(f"{API}/brand-kits/{kit['id']}/publish", headers=_hdr(other), json={"public": True}, timeout=20)
        assert r.status_code == 404, r.text  # owner-scoped lookup returns 404 for non-owners


# --- Gallery feed privacy ----------------------------------------------------
class TestGalleryFeed:
    def test_gallery_no_auth_and_privacy(self):
        t, email = _register("gal")
        kit = _create_kit(t, name="TEST_Gallery Kit")
        # publish
        pub = requests.post(f"{API}/brand-kits/{kit['id']}/publish", headers=_hdr(t), json={"public": True}, timeout=20)
        assert pub.status_code == 200

        # fetch WITHOUT auth
        r = requests.get(f"{API}/gallery", timeout=20)  # no auth header
        assert r.status_code == 200, r.text
        data = r.json()
        assert "items" in data and isinstance(data["items"], list)

        # find our kit
        ours = next((it for it in data["items"] if it["id"] == kit["id"]), None)
        assert ours is not None, "Published kit missing from gallery"

        # PRIVACY: MUST NOT expose user_id, email, or real name
        raw = str(ours)
        assert "user_id" not in ours, "user_id leaked!"
        assert "email" not in ours, "email leaked!"
        assert email not in raw, "email string leaked in serialized item!"
        # allowed fields
        for f in ("id", "name", "colors", "fonts", "style_rules", "logo", "alias", "remix_count", "published_at"):
            assert f in ours, f"missing public field: {f}"
        assert ours["alias"] == "A CreatorForge maker"


# --- Remix -------------------------------------------------------------------
class TestRemix:
    def test_remix_clones_and_increments(self):
        owner, _ = _register("owner2")
        remixer, _ = _register("remixer")
        src = _create_kit(owner, name="TEST_Original")
        # publish
        requests.post(f"{API}/brand-kits/{src['id']}/publish", headers=_hdr(owner), json={"public": True}, timeout=20)

        # remixer clones
        r = requests.post(f"{API}/gallery/{src['id']}/remix", headers=_hdr(remixer), json={}, timeout=20)
        assert r.status_code == 200, r.text
        clone = r.json()["brand_kit"]
        assert clone["name"].endswith("(remix)")
        assert clone["colors"] == src["colors"]
        assert clone["fonts"] == src["fonts"]
        assert clone["style_rules"] == src["style_rules"]
        assert clone["logo"] is None
        assert clone["remixed_from"] == src["id"]

        # verify remix_count incremented on source
        r2 = requests.get(f"{API}/gallery", timeout=20)
        ours = next(it for it in r2.json()["items"] if it["id"] == src["id"])
        assert ours["remix_count"] >= 1

        # remixer can GET the new kit
        r3 = requests.get(f"{API}/brand-kits/{clone['id']}", headers=_hdr(remixer), timeout=20)
        assert r3.status_code == 200

    def test_remix_of_nonpublic_returns_404(self):
        owner, _ = _register("owner3")
        other, _ = _register("other3")
        kit = _create_kit(owner, name="TEST_Private")
        # don't publish; try to remix
        r = requests.post(f"{API}/gallery/{kit['id']}/remix", headers=_hdr(other), json={}, timeout=20)
        assert r.status_code == 404

    def test_remix_of_unknown_returns_404(self):
        t, _ = _register("unk")
        r = requests.post(f"{API}/gallery/{uuid.uuid4()}/remix", headers=_hdr(t), json={}, timeout=20)
        assert r.status_code == 404


# --- Report auto-unpublish ----------------------------------------------------
class TestReport:
    def test_three_reports_auto_unpublish(self):
        owner, _ = _register("rowner")
        r1, _ = _register("r1")
        r2, _ = _register("r2")
        r3, _ = _register("r3")
        kit = _create_kit(owner, name="TEST_Reportable")
        pub = requests.post(f"{API}/brand-kits/{kit['id']}/publish", headers=_hdr(owner), json={"public": True}, timeout=20)
        assert pub.status_code == 200

        for i, t in enumerate([r1, r2, r3], start=1):
            r = requests.post(f"{API}/gallery/{kit['id']}/report", headers=_hdr(t), json={"reason": "spam"}, timeout=20)
            if i < 3:
                assert r.status_code == 200
                assert r.json()["reports"] == i
                assert r.json()["hidden"] is False
            else:
                assert r.status_code == 200
                assert r.json()["hidden"] is True

        # verify no longer in public gallery
        g = requests.get(f"{API}/gallery", timeout=20)
        ids = [it["id"] for it in g.json()["items"]]
        assert kit["id"] not in ids, "Auto-unpublished kit still visible in gallery!"

        # subsequent report of hidden/non-public returns 404
        r_after = requests.post(f"{API}/gallery/{kit['id']}/report", headers=_hdr(r1), json={}, timeout=20)
        assert r_after.status_code == 404
