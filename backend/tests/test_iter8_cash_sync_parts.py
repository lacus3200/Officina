"""Iteration 8: cash <-> sales/repairs sync, part purchase movements, cash reference."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to frontend .env parsing
    from pathlib import Path
    env = Path("/app/frontend/.env").read_text()
    for line in env.splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
            break

API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": "admin@lab.local", "password": "admin123"})
    assert r.status_code == 200, r.text
    return s


# ---------- Cash sync endpoint ----------
def test_cash_sync_keys_and_idempotent(client):
    r1 = client.post(f"{API}/cash/sync")
    assert r1.status_code == 200
    d1 = r1.json()
    for k in ("sales_added", "sales_fixed", "orphans_removed", "repairs_added", "parts_added"):
        assert k in d1
    r2 = client.post(f"{API}/cash/sync")
    assert r2.status_code == 200
    d2 = r2.json()
    assert all(d2[k] == 0 for k in d2), f"not idempotent: {d2}"


# ---------- Sale -> cash movement created; deleting cash directly is blocked ----------
def test_sale_creates_cash_and_delete_blocked(client):
    r = client.post(f"{API}/sales", json={
        "customer_name": "TEST_iter8_sale",
        "items": [{"description": "TEST item", "quantity": 1, "unit_price": 50.0}],
        "total": 50.0,
        "payment_method": "contanti",
    })
    assert r.status_code == 200, r.text
    sale = r.json()
    sale_id = sale["id"]

    cash = client.get(f"{API}/cash").json()
    mov = next((m for m in cash if m.get("reference_id") == sale_id and m.get("category") == "vendita"), None)
    assert mov is not None, "cash movement for sale not created"
    assert mov["type"] == "entrata"
    assert abs(mov["amount"] - 50.0) < 0.01

    # try to delete the cash movement -> should be blocked with 400
    dr = client.delete(f"{API}/cash/{mov['id']}")
    assert dr.status_code == 400, f"expected 400, got {dr.status_code}: {dr.text}"

    # delete the sale -> movement removed
    dsr = client.delete(f"{API}/sales/{sale_id}")
    assert dsr.status_code == 200
    cash2 = client.get(f"{API}/cash").json()
    assert not any(m.get("reference_id") == sale_id for m in cash2)


# ---------- Manual cash movement (no reference) can be deleted ----------
def test_manual_cash_deletable(client):
    r = client.post(f"{API}/cash", json={
        "type": "uscita", "category": "altro", "amount": 5.0, "description": "TEST_manual"
    })
    assert r.status_code == 200
    mov_id = r.json()["id"]
    dr = client.delete(f"{API}/cash/{mov_id}")
    assert dr.status_code == 200


# ---------- Part creation triggers acquisto_ricambi movement ----------
def test_part_create_and_update_generates_cash(client):
    r = client.post(f"{API}/parts", json={
        "name": "TEST_iter8_ricambio",
        "cost_price": 10.0,
        "quantity": 4,
    })
    assert r.status_code == 200
    part = r.json()
    part_id = part["id"]

    cash = client.get(f"{API}/cash").json()
    movs = [m for m in cash if m.get("reference_id") == part_id and m.get("category") == "acquisto_ricambi"]
    assert len(movs) == 1
    assert abs(movs[0]["amount"] - 40.0) < 0.01
    assert movs[0]["type"] == "uscita"

    # Increase quantity 4 -> 6 => new movement for delta 2 * 10 = 20
    up = client.put(f"{API}/parts/{part_id}", json={
        "name": part["name"], "cost_price": 10.0, "quantity": 6,
    })
    assert up.status_code == 200
    cash2 = client.get(f"{API}/cash").json()
    movs2 = [m for m in cash2 if m.get("reference_id") == part_id and m.get("category") == "acquisto_ricambi"]
    assert len(movs2) == 2
    amounts = sorted(m["amount"] for m in movs2)
    assert amounts == [20.0, 40.0], f"unexpected amounts: {amounts}"

    # Decrease quantity 6 -> 3: no new movement
    dn = client.put(f"{API}/parts/{part_id}", json={
        "name": part["name"], "cost_price": 10.0, "quantity": 3,
    })
    assert dn.status_code == 200
    cash3 = client.get(f"{API}/cash").json()
    movs3 = [m for m in cash3 if m.get("reference_id") == part_id and m.get("category") == "acquisto_ricambi"]
    assert len(movs3) == 2, f"expected still 2 movements, got {len(movs3)}"

    # cash reference endpoint returns type 'part'
    ref = client.get(f"{API}/cash/{movs3[0]['id']}/reference")
    assert ref.status_code == 200
    body = ref.json()
    assert body["type"] == "part"
    assert body["data"]["id"] == part_id

    # cleanup
    client.delete(f"{API}/parts/{part_id}")
