"""Iteration 10: Feature flags + Beta behavior tests.

Covers:
- Public GET /api/config/flags
- Register: new tester gets beta_premium=true, unlimited generations
- Login: demo account hidden (401) when demo_account_visible=false
- Admin endpoints: X-Admin-Key required (403 without, 403 wrong, 200 correct)
- Admin PATCH cycle: allow_new_signups toggle → register 403 → restore
- Admin PATCH cycle: demo_account_visible toggle → demo login works → restore
- Restores flags to {beta_premium:true, demo_visible:false, allow_signups:true}
"""
import os
import time
import uuid
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

# Load backend .env to read ADMIN_API_KEY
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL"
) else "https://brand-spark-12.preview.emergentagent.com"
ADMIN_KEY = os.environ.get("ADMIN_API_KEY", "").strip()
DEMO_EMAIL = "demo@creatorforge.app"
DEMO_PASSWORD = "creator123"

TIMEOUT = 30


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module", autouse=True)
def restore_flags_at_end(s):
    """Ensure flags are restored to intended beta state after this module runs."""
    yield
    if ADMIN_KEY:
        s.patch(
            f"{BASE_URL}/api/admin/feature-flags",
            headers={"X-Admin-Key": ADMIN_KEY},
            json={
                "beta_premium_enabled": True,
                "demo_account_visible": False,
                "allow_new_signups": True,
            },
            timeout=TIMEOUT,
        )


# ------------- 1. Public flags -------------
class TestPublicFlags:
    def test_public_flags_shape_and_defaults(self, s):
        r = s.get(f"{BASE_URL}/api/config/flags", timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        data = r.json()
        assert set(data.keys()) == {
            "beta_premium_enabled",
            "demo_account_visible",
            "allow_new_signups",
        }, f"Unexpected keys or secrets leaked: {data.keys()}"
        assert data["beta_premium_enabled"] is True
        assert data["demo_account_visible"] is False
        assert data["allow_new_signups"] is True
        # No secret-like fields present
        for k in data:
            assert "key" not in k.lower()
            assert "secret" not in k.lower()

    def test_public_flags_no_auth_required(self, s):
        # explicit no auth headers
        r = requests.get(f"{BASE_URL}/api/config/flags", timeout=TIMEOUT)
        assert r.status_code == 200


# ------------- 2. Fresh tester register + premium -------------
class TestTesterRegister:
    def test_register_new_tester_gets_beta_premium(self, s):
        email = f"TEST_beta_{uuid.uuid4().hex[:8]}@example.com"
        r = s.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": email, "password": "testpass123", "name": "Beta Tester"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["email"] == email.lower()
        assert data["user"].get("beta_premium") is True, data["user"]

        token = data["token"]
        # GET /api/usage → premium, unlimited
        u = s.get(
            f"{BASE_URL}/api/usage",
            headers={"Authorization": f"Bearer {token}"},
            timeout=TIMEOUT,
        )
        assert u.status_code == 200, u.text
        usage = u.json()
        assert usage["plan"] == "premium", usage
        assert usage["generations_limit"] is None, usage

    def test_normal_login_flow_still_works(self, s):
        # Register a fresh account then login with it
        email = f"TEST_login_{uuid.uuid4().hex[:8]}@example.com"
        pw = "testpass123"
        r = s.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": email, "password": pw, "name": "Login Tester"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200
        # Now login
        lr = s.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": email, "password": pw},
            timeout=TIMEOUT,
        )
        assert lr.status_code == 200, lr.text
        assert "token" in lr.json()


# ------------- 3. Demo account hidden -------------
class TestDemoHidden:
    def test_demo_login_returns_401_when_hidden(self, s):
        r = s.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD},
            timeout=TIMEOUT,
        )
        assert r.status_code == 401, r.text
        detail = r.json().get("detail", "")
        # generic error only (no enumeration)
        assert "invalid" in detail.lower() or "incorrect" in detail.lower(), detail


# ------------- 4. Admin endpoint security -------------
class TestAdminEndpointSecurity:
    def test_admin_get_without_key_403(self, s):
        r = s.get(f"{BASE_URL}/api/admin/feature-flags", timeout=TIMEOUT)
        assert r.status_code == 403

    def test_admin_get_with_wrong_key_403(self, s):
        r = s.get(
            f"{BASE_URL}/api/admin/feature-flags",
            headers={"X-Admin-Key": "wrong-key-xyz"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 403

    def test_admin_patch_without_key_403(self, s):
        r = s.patch(
            f"{BASE_URL}/api/admin/feature-flags",
            json={"allow_new_signups": False},
            timeout=TIMEOUT,
        )
        assert r.status_code == 403

    def test_admin_get_with_correct_key(self, s):
        assert ADMIN_KEY, "ADMIN_API_KEY missing from backend/.env"
        r = s.get(
            f"{BASE_URL}/api/admin/feature-flags",
            headers={"X-Admin-Key": ADMIN_KEY},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text
        assert "flags" in r.json()


# ------------- 5. Admin toggle: allow_new_signups -------------
class TestAllowSignupsToggle:
    def test_disable_signups_then_restore(self, s):
        assert ADMIN_KEY, "ADMIN_API_KEY missing"
        # Disable
        r = s.patch(
            f"{BASE_URL}/api/admin/feature-flags",
            headers={"X-Admin-Key": ADMIN_KEY},
            json={"allow_new_signups": False},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text
        assert r.json()["flags"]["allow_new_signups"] is False

        # Public flag reflects it
        pf = s.get(f"{BASE_URL}/api/config/flags", timeout=TIMEOUT).json()
        assert pf["allow_new_signups"] is False

        # Register should fail with 403
        email = f"TEST_closed_{uuid.uuid4().hex[:8]}@example.com"
        rr = s.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": email, "password": "testpass123", "name": "Closed"},
            timeout=TIMEOUT,
        )
        assert rr.status_code == 403, rr.text
        assert "sign" in rr.json().get("detail", "").lower()

        # Restore
        r2 = s.patch(
            f"{BASE_URL}/api/admin/feature-flags",
            headers={"X-Admin-Key": ADMIN_KEY},
            json={"allow_new_signups": True},
            timeout=TIMEOUT,
        )
        assert r2.status_code == 200
        assert r2.json()["flags"]["allow_new_signups"] is True

        # Confirm register works again
        email2 = f"TEST_reopen_{uuid.uuid4().hex[:8]}@example.com"
        rr2 = s.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": email2, "password": "testpass123", "name": "Reopen"},
            timeout=TIMEOUT,
        )
        assert rr2.status_code == 200, rr2.text


# ------------- 6. Admin toggle: demo_account_visible -------------
class TestDemoVisibilityToggle:
    def test_show_demo_login_works_then_restore(self, s):
        assert ADMIN_KEY, "ADMIN_API_KEY missing"
        # Show demo
        r = s.patch(
            f"{BASE_URL}/api/admin/feature-flags",
            headers={"X-Admin-Key": ADMIN_KEY},
            json={"demo_account_visible": True},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200
        assert r.json()["flags"]["demo_account_visible"] is True

        # Login with demo should succeed
        lr = s.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD},
            timeout=TIMEOUT,
        )
        assert lr.status_code == 200, lr.text
        assert lr.json()["user"]["email"] == DEMO_EMAIL

        # Hide again
        r2 = s.patch(
            f"{BASE_URL}/api/admin/feature-flags",
            headers={"X-Admin-Key": ADMIN_KEY},
            json={"demo_account_visible": False},
            timeout=TIMEOUT,
        )
        assert r2.status_code == 200
        assert r2.json()["flags"]["demo_account_visible"] is False

        # Demo login blocked again
        lr2 = s.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD},
            timeout=TIMEOUT,
        )
        assert lr2.status_code == 401, lr2.text


# ------------- 7. Final verification of restored state -------------
class TestFinalState:
    def test_final_flags_restored(self, s):
        # Explicitly restore then verify
        if ADMIN_KEY:
            s.patch(
                f"{BASE_URL}/api/admin/feature-flags",
                headers={"X-Admin-Key": ADMIN_KEY},
                json={
                    "beta_premium_enabled": True,
                    "demo_account_visible": False,
                    "allow_new_signups": True,
                },
                timeout=TIMEOUT,
            )
        time.sleep(1)
        pf = s.get(f"{BASE_URL}/api/config/flags", timeout=TIMEOUT).json()
        assert pf == {
            "beta_premium_enabled": True,
            "demo_account_visible": False,
            "allow_new_signups": True,
        }, pf
