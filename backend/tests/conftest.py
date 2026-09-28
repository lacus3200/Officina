import os
from pathlib import Path

import pytest
import requests


def _read_env(path: str, key: str) -> str:
    p = Path(path)
    if not p.exists():
        return ""
    for line in p.read_text().splitlines():
        if line.startswith(f"{key}="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _read_env("/app/frontend/.env", "REACT_APP_BACKEND_URL")).rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL") or _read_env("/app/backend/.env", "ADMIN_EMAIL")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD") or _read_env("/app/backend/.env", "ADMIN_PASSWORD")


@pytest.fixture(scope="session")
def api_url() -> str:
    return API


@pytest.fixture(scope="session")
def admin_credentials() -> dict:
    assert ADMIN_EMAIL and ADMIN_PASSWORD, "Set TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD"
    return {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}


@pytest.fixture(scope="session")
def client(admin_credentials) -> requests.Session:
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=admin_credentials)
    assert r.status_code == 200, r.text
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"})
    return s


@pytest.fixture
def temp_part(client):
    created = []

    def _make(**overrides):
        payload = {"name": "TEST_part", "quantity": 0, "min_quantity": 0, "cost_price": 0.0, "sell_price": 0.0, **overrides}
        p = client.post(f"{API}/parts", json=payload).json()
        created.append(p["id"])
        return p

    yield _make
    for pid in created:
        client.delete(f"{API}/parts/{pid}")


def cash_for(client, reference_id: str, category: str | None = None) -> list:
    movs = [m for m in client.get(f"{API}/cash").json() if m.get("reference_id") == reference_id]
    return [m for m in movs if category is None or m.get("category") == category]
