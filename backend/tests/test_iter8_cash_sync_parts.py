import pytest
"""Iteration 8: cash <-> sales/repairs sync, part purchase movements, cash reference."""
from conftest import API


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
from conftest import cash_for  # noqa: E402


@pytest.fixture
def cash_part(temp_part):
    return temp_part(name="TEST_iter8_ricambio", cost_price=10.0, quantity=4)


def set_qty(client, part, qty):
    r = client.put(f"{API}/parts/{part['id']}", json={"name": part["name"], "cost_price": 10.0, "quantity": qty})
    assert r.status_code == 200, r.text


def test_part_create_generates_cash(client, cash_part):
    movs = cash_for(client, cash_part["id"], "acquisto_ricambi")
    assert len(movs) == 1
    assert movs[0]["type"] == "uscita"
    assert abs(movs[0]["amount"] - 40.0) < 0.01


def test_part_quantity_increase_generates_delta(client, cash_part):
    set_qty(client, cash_part, 6)
    amounts = sorted(m["amount"] for m in cash_for(client, cash_part["id"], "acquisto_ricambi"))
    assert amounts == [20.0, 40.0]


def test_part_quantity_decrease_no_movement(client, cash_part):
    set_qty(client, cash_part, 3)
    assert len(cash_for(client, cash_part["id"], "acquisto_ricambi")) == 1


def test_part_cash_reference_type(client, cash_part):
    mov = cash_for(client, cash_part["id"], "acquisto_ricambi")[0]
    ref = client.get(f"{API}/cash/{mov['id']}/reference")
    assert ref.status_code == 200
    assert ref.json()["type"] == "part"
    assert ref.json()["data"]["id"] == cash_part["id"]
