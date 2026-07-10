"""CreatorForge iteration 3 tests — DELETE account, analytics, brand-kit custom colors."""
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


@pytest.fixture(scope="module")
def demo_token():
    r = requests.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


# ------------------- DELETE /api/auth/account (GDPR erasure) -------------------
class TestDeleteAccount:
    def test_delete_flow_erases_all_data(self):
        email = f"tester+del_{uuid.uuid4().hex[:8]}@creatorforge.app"
        # 1. Register throwaway user
        r = requests.post(f"{API}/auth/register", json={"email": email, "password": "pw12345", "name": "Delete Me"}, timeout=30)
        assert r.status_code == 200, r.text
        token = r.json()["token"]
        uid = r.json()["user"]["user_id"]

        # 2. Create a project
        pr = requests.post(f"{API}/projects", json={
            "title": "TEST_del_project", "summary": "s", "pitch": "p",
            "tasks": [], "brand_keywords": ["bold"], "source_idea": "erasure test"
        }, headers=H(token), timeout=30)
        assert pr.status_code == 200, pr.text
        project_id = pr.json()["project"]["id"]

        # 3. Create a brand kit (no AI)
        bk = requests.post(f"{API}/brand-kits", json={
            "project_id": project_id, "name": "TEST_del_kit",
            "auto_generate": False, "colors": ["#111111", "#222222", "#333333"]
        }, headers=H(token), timeout=30)
        assert bk.status_code == 200, bk.text

        # 4. Verify project exists before delete
        lst = requests.get(f"{API}/projects", headers=H(token), timeout=15)
        assert lst.status_code == 200
        assert any(p["id"] == project_id for p in lst.json()["projects"])

        # 5. DELETE /api/auth/account
        d = requests.delete(f"{API}/auth/account", headers=H(token), timeout=30)
        assert d.status_code == 200, d.text
        assert d.json().get("ok") is True

        # 6. Subsequent /auth/me should return 401 (token invalidated / user gone)
        me = requests.get(f"{API}/auth/me", headers=H(token), timeout=15)
        assert me.status_code in (401, 403), f"expected 401/403 got {me.status_code} body={me.text}"

        # 7. Projects & brand kits should be gone — try login again should fail
        login = requests.post(f"{API}/auth/login", json={"email": email, "password": "pw12345"}, timeout=15)
        assert login.status_code == 401, f"deleted user should not be able to log in, got {login.status_code}"

    def test_delete_unauthenticated_rejected(self):
        r = requests.delete(f"{API}/auth/account", timeout=15)
        assert r.status_code in (401, 403)


# ------------------- GET /api/analytics -------------------
class TestAnalytics:
    def test_analytics_shape_demo(self, demo_token):
        r = requests.get(f"{API}/analytics", headers=H(demo_token), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()

        # keys present
        for k in ("total_projects", "total_assets", "status_counts", "type_counts", "tasks", "activity"):
            assert k in d, f"missing key {k}"

        # types
        assert isinstance(d["total_projects"], int)
        assert isinstance(d["total_assets"], int)

        # status_counts must include idea/branding/done
        sc = d["status_counts"]
        for k in ("idea", "branding", "done"):
            assert k in sc, f"status_counts missing {k}"
            assert isinstance(sc[k], int)

        # tasks
        assert "total" in d["tasks"] and "done" in d["tasks"]
        assert isinstance(d["tasks"]["total"], int)
        assert isinstance(d["tasks"]["done"], int)

        # activity: exactly 7 entries, each with date + count
        assert isinstance(d["activity"], list)
        assert len(d["activity"]) == 7, f"expected 7 activity entries, got {len(d['activity'])}"
        for entry in d["activity"]:
            assert "date" in entry and "count" in entry
            assert isinstance(entry["count"], int)

        # type_counts is a dict (possibly empty)
        assert isinstance(d["type_counts"], dict)

    def test_analytics_requires_auth(self):
        r = requests.get(f"{API}/analytics", timeout=15)
        assert r.status_code in (401, 403)


# ------------------- POST /api/brand-kits (custom colors, no AI) -------------------
class TestBrandKitCustomColors:
    def test_custom_colors_used_verbatim(self, demo_token):
        # Grab usage before
        before = requests.get(f"{API}/usage", headers=H(demo_token), timeout=15).json()
        gen_before = before.get("generations_used", 0)

        custom_colors = ["#FF00AA", "#00FFAA", "#AA00FF", "#123456", "#ABCDEF"]
        custom_rules = ["TEST_rule_one", "TEST_rule_two"]

        r = requests.post(f"{API}/brand-kits", json={
            "name": "TEST_CustomKit",
            "auto_generate": False,
            "colors": custom_colors,
            "style_rules": custom_rules,
        }, headers=H(demo_token), timeout=30)
        assert r.status_code == 200, r.text
        kit = r.json()["brand_kit"]

        # EXACT colors
        assert kit["colors"] == custom_colors, f"expected {custom_colors} got {kit['colors']}"
        assert kit["style_rules"] == custom_rules
        assert kit["name"] == "TEST_CustomKit"

        # Verify persistence via GET
        g = requests.get(f"{API}/brand-kits/{kit['id']}", headers=H(demo_token), timeout=15)
        assert g.status_code == 200
        assert g.json()["brand_kit"]["colors"] == custom_colors

        # Ensure no AI generation was consumed
        after = requests.get(f"{API}/usage", headers=H(demo_token), timeout=15).json()
        gen_after = after.get("generations_used", 0)
        assert gen_after == gen_before, f"auto_generate=false should not consume AI: before={gen_before} after={gen_after}"

        # cleanup
        requests.delete(f"{API}/brand-kits/{kit['id']}", headers=H(demo_token), timeout=15)
