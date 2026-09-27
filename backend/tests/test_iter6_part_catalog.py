"""Backend tests for iter6: Part catalog, guess-category, compatible_models."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback to reading frontend .env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL"):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": "admin@lab.local", "password": "admin123"})
    assert r.status_code == 200, r.text
    return s


def test_catalog_parts_seed(client):
    r = client.get(f"{BASE_URL}/api/catalog/parts")
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 43, f"Expected 43+ templates, got {len(data)}"
    # ensure grouping fields exist
    cats = {t.get("category") for t in data}
    assert "Schermo" in cats
    assert "Batteria" in cats


def test_guess_category(client):
    r = client.get(f"{BASE_URL}/api/catalog/parts/guess-category",
                   params={"name": "ssd nvme 2TB"})
    assert r.status_code == 200
    assert r.json()["category"] == "Storage"

    r = client.get(f"{BASE_URL}/api/catalog/parts/guess-category",
                   params={"name": "Ventola CPU"})
    assert r.json()["category"] == "Raffreddamento"

    r = client.get(f"{BASE_URL}/api/catalog/parts/guess-category",
                   params={"name": "xyz random"})
    assert r.json()["category"] is None


def test_catalog_parts_create_dedup_and_autocat(client):
    # Missing category, should auto
    r = client.post(f"{BASE_URL}/api/catalog/parts",
                    json={"name": "TEST_Ventola CPU custom"})
    assert r.status_code == 200
    d1 = r.json()
    assert d1["category"] == "Raffreddamento"
    tpl_id = d1["id"]

    # Dedup case-insensitive
    r2 = client.post(f"{BASE_URL}/api/catalog/parts",
                     json={"name": "test_ventola cpu CUSTOM"})
    assert r2.status_code == 200
    assert r2.json()["id"] == tpl_id

    # Unknown -> Altro
    r3 = client.post(f"{BASE_URL}/api/catalog/parts",
                     json={"name": "TEST_qwerty unknown xyz"})
    assert r3.status_code == 200
    assert r3.json()["category"] == "Altro"

    # cleanup
    client.delete(f"{BASE_URL}/api/catalog/parts/{tpl_id}")
    client.delete(f"{BASE_URL}/api/catalog/parts/{r3.json()['id']}")


def test_create_part_autocategory(client):
    r = client.post(f"{BASE_URL}/api/parts", json={
        "name": "TEST_Batteria iPhone 13",
        "quantity": 2,
        "compatible_models": ["Apple iPhone 13"],
    })
    assert r.status_code == 200
    part = r.json()
    assert part["category"] == "Batteria"
    assert part["compatible_models"] == ["Apple iPhone 13"]
    pid = part["id"]

    # Verify via GET
    g = client.get(f"{BASE_URL}/api/parts/{pid}")
    assert g.status_code == 200
    assert g.json()["category"] == "Batteria"

    # Update compatible_models
    u = client.put(f"{BASE_URL}/api/parts/{pid}", json={
        "name": "TEST_Batteria iPhone 13",
        "compatible_models": ["Apple iPhone 13", "Apple iPhone 14"],
    })
    assert u.status_code == 200
    assert set(u.json()["compatible_models"]) == {"Apple iPhone 13", "Apple iPhone 14"}

    client.delete(f"{BASE_URL}/api/parts/{pid}")


def test_create_part_explicit_category_wins(client):
    r = client.post(f"{BASE_URL}/api/parts", json={
        "name": "TEST_random name no keyword",
        "category": "CustomCat",
        "quantity": 1,
    })
    assert r.status_code == 200
    assert r.json()["category"] == "CustomCat"
    client.delete(f"{BASE_URL}/api/parts/{r.json()['id']}")
