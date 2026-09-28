"""Iter13: repair-parts surcharge, delete flows with restore_parts, refurb margin sync, propagation."""
import pytest
from tests.conftest import API, cash_for


# ---- helpers ----
def _mk_part(client, qty=10, sell=20.0, cost=5.0, name="TEST_p_iter13"):
    p = client.post(f"{API}/parts", json={
        "name": name, "quantity": qty, "min_quantity": 0, "cost_price": cost, "sell_price": sell,
    }).json()
    return p


def _mk_customer(client, name="TEST_cust_iter13"):
    return client.post(f"{API}/customers", json={"name": name}).json()


def _mk_repair(client, customer_id, parts_used=None, final_price=0.0, status="in_attesa", paid=False):
    r = client.post(f"{API}/repairs", json={
        "customer_id": customer_id,
        "device_type": "smartphone",
        "device_brand": "TestBr", "device_model": "TestMd",
        "problem": "x",
        "parts_used": parts_used or [],
        "final_price": final_price,
        "status": status,
        "paid": paid,
    })
    assert r.status_code == 200, r.text
    return r.json()


def _mk_refurb(client, cost=100.0, target=300.0):
    r = client.post(f"{API}/refurbished", json={
        "device_type": "smartphone",
        "brand": "TestBr", "model": "TestMd", "purchase_cost": cost, "target_price": target,
    })
    assert r.status_code == 200, r.text
    return r.json()


# ---- 1. surcharge persistence on POST/PUT + parts_used_total ----
def test_repair_parts_used_surcharge_persists(client):
    part = _mk_part(client, qty=5, sell=20.0)
    cust = _mk_customer(client)
    parts_used = [{"part_id": part["id"], "part_name": part["name"], "quantity": 2, "unit_price": 20.0, "surcharge": 5.0}]
    rep = _mk_repair(client, cust["id"], parts_used=parts_used)
    try:
        assert rep["parts_used"][0]["surcharge"] == 5.0
        assert rep["parts_used"][0]["quantity"] == 2
        # stock decreased by 2
        p_after = client.get(f"{API}/parts/{part['id']}").json()
        assert p_after["quantity"] == 3

        # PUT: update surcharge to 7 and qty to 1
        updated = client.put(f"{API}/repairs/{rep['id']}", json={
            "parts_used": [{"part_id": part["id"], "part_name": part["name"], "quantity": 1, "unit_price": 20.0, "surcharge": 7.0}],
        }).json()
        assert updated["parts_used"][0]["surcharge"] == 7.0
        assert updated["parts_used"][0]["quantity"] == 1
        # stock now +1 => 4
        p_after2 = client.get(f"{API}/parts/{part['id']}").json()
        assert p_after2["quantity"] == 4
    finally:
        client.delete(f"{API}/repairs/{rep['id']}?restore_parts=true")
        client.delete(f"{API}/customers/{cust['id']}")
        client.delete(f"{API}/parts/{part['id']}")


# ---- 2. refurb parts_cost = Σ(qty*unit_price + surcharge) ----
def test_refurb_parts_cost_uses_surcharge(client):
    part = _mk_part(client, qty=5, sell=20.0)
    cust = _mk_customer(client)
    ref = _mk_refurb(client, cost=100.0, target=300.0)
    try:
        # Create repair linked via refurb open-repair endpoint
        r = client.post(f"{API}/refurbished/{ref['id']}/open-repair", json={}).json()
        repair = r["repair"]
        # Add part with qty=1, price=20, surcharge=7 -> parts_cost = 27
        client.put(f"{API}/repairs/{repair['id']}", json={
            "parts_used": [{"part_id": part["id"], "part_name": part["name"], "quantity": 1, "unit_price": 20.0, "surcharge": 7.0}],
        })
        enriched = client.get(f"{API}/refurbished/{ref['id']}").json()
        assert enriched["parts_cost"] == 27.0
        assert enriched["total_cost"] == 127.0  # 100 + 27
        assert enriched["expected_margin"] == 173.0  # 300 - 127
    finally:
        client.delete(f"{API}/refurbished/{ref['id']}?delete_sale=true&restore_parts=true")
        client.delete(f"{API}/customers/{cust['id']}")
        client.delete(f"{API}/parts/{part['id']}")


# ---- 3. PUT final_price on delivered+paid updates cash ----
def test_put_final_price_updates_cash_amount(client):
    cust = _mk_customer(client)
    rep = _mk_repair(client, cust["id"], final_price=100.0, status="consegnata", paid=True)
    try:
        movs = cash_for(client, rep["id"], "riparazione")
        assert len(movs) == 1
        assert movs[0]["amount"] == 100.0
        # update final_price
        client.put(f"{API}/repairs/{rep['id']}", json={"final_price": 150.0})
        movs2 = cash_for(client, rep["id"], "riparazione")
        assert len(movs2) == 1
        assert movs2[0]["amount"] == 150.0
    finally:
        client.delete(f"{API}/repairs/{rep['id']}?restore_parts=false")
        client.delete(f"{API}/customers/{cust['id']}")


# ---- 4. PUT paid=false on delivered removes cash movement ----
def test_put_paid_false_removes_cash(client):
    cust = _mk_customer(client)
    rep = _mk_repair(client, cust["id"], final_price=80.0, status="consegnata", paid=True)
    try:
        assert len(cash_for(client, rep["id"], "riparazione")) == 1
        client.put(f"{API}/repairs/{rep['id']}", json={"paid": False})
        assert len(cash_for(client, rep["id"], "riparazione")) == 0
    finally:
        client.delete(f"{API}/repairs/{rep['id']}?restore_parts=false")
        client.delete(f"{API}/customers/{cust['id']}")


# ---- 5. DELETE /repairs with restore_parts flag ----
def test_delete_repair_restore_parts_false(client):
    part = _mk_part(client, qty=5, sell=20.0)
    cust = _mk_customer(client)
    rep = _mk_repair(client, cust["id"], parts_used=[
        {"part_id": part["id"], "part_name": part["name"], "quantity": 2, "unit_price": 20.0, "surcharge": 0.0}
    ])
    try:
        assert client.get(f"{API}/parts/{part['id']}").json()["quantity"] == 3
        before = [m for m in client.get(f"{API}/cash").json() if m.get("category") == "acquisto_ricambi"]
        # delete WITHOUT restoring
        r = client.delete(f"{API}/repairs/{rep['id']}?restore_parts=false")
        assert r.status_code == 200
        # stock stays at 3, no new acquisto_ricambi movement
        assert client.get(f"{API}/parts/{part['id']}").json()["quantity"] == 3
        after = [m for m in client.get(f"{API}/cash").json() if m.get("category") == "acquisto_ricambi"]
        assert len(after) == len(before)
    finally:
        client.delete(f"{API}/customers/{cust['id']}")
        client.delete(f"{API}/parts/{part['id']}")


def test_delete_repair_restore_parts_true_no_cash(client):
    part = _mk_part(client, qty=5, sell=20.0)
    cust = _mk_customer(client)
    rep = _mk_repair(client, cust["id"], parts_used=[
        {"part_id": part["id"], "part_name": part["name"], "quantity": 2, "unit_price": 20.0, "surcharge": 3.0}
    ])
    try:
        assert client.get(f"{API}/parts/{part['id']}").json()["quantity"] == 3
        # capture cash_movements count of category acquisto_ricambi before
        before = [m for m in client.get(f"{API}/cash").json() if m.get("category") == "acquisto_ricambi"]
        r = client.delete(f"{API}/repairs/{rep['id']}?restore_parts=true")
        assert r.status_code == 200
        # stock restored to 5
        assert client.get(f"{API}/parts/{part['id']}").json()["quantity"] == 5
        # NO new acquisto_ricambi movement
        after = [m for m in client.get(f"{API}/cash").json() if m.get("category") == "acquisto_ricambi"]
        assert len(after) == len(before)
    finally:
        client.delete(f"{API}/customers/{cust['id']}")
        client.delete(f"{API}/parts/{part['id']}")


# ---- 6. DELETE /refurbished with delete_sale & restore_parts ----
def test_delete_refurbished_full_cascade(client):
    part = _mk_part(client, qty=5, sell=20.0)
    cust = _mk_customer(client)
    ref = _mk_refurb(client, cost=100.0, target=300.0)
    stock_before = client.get(f"{API}/parts/{part['id']}").json()["quantity"]
    try:
        # open repair on refurb, add part
        r = client.post(f"{API}/refurbished/{ref['id']}/open-repair", json={}).json()
        repair_id = r["repair"]["id"]
        client.put(f"{API}/repairs/{repair_id}", json={
            "parts_used": [{"part_id": part["id"], "part_name": part["name"], "quantity": 1, "unit_price": 20.0, "surcharge": 7.0}],
        })
        # Sell it
        sell_resp = client.post(f"{API}/refurbished/{ref['id']}/sell", json={"sale_price": 300.0, "customer_id": cust["id"]})
        assert sell_resp.status_code == 200
        enriched = client.get(f"{API}/refurbished/{ref['id']}").json()
        assert enriched["status"] == "venduto"
        assert enriched["margin"] == 173.0  # 300 - 127
        sale_id = enriched["sale_id"]

        # verify sale exists
        sales = client.get(f"{API}/sales").json()
        assert any(s["id"] == sale_id for s in sales)

        acq_before = [m for m in client.get(f"{API}/cash").json() if m.get("category") == "acquisto_ricambi"]

        # delete refurbished with cascade
        d = client.delete(f"{API}/refurbished/{ref['id']}?delete_sale=true&restore_parts=true")
        assert d.status_code == 200

        # refurb gone
        assert client.get(f"{API}/refurbished/{ref['id']}").status_code == 404
        # sale gone
        sales2 = client.get(f"{API}/sales").json()
        assert not any(s["id"] == sale_id for s in sales2)
        # repair gone
        assert client.get(f"{API}/repairs/{repair_id}").status_code == 404
        # part restored
        assert client.get(f"{API}/parts/{part['id']}").json()["quantity"] == stock_before
        # NO new acquisto_ricambi
        acq_after = [m for m in client.get(f"{API}/cash").json() if m.get("category") == "acquisto_ricambi"]
        assert len(acq_after) == len(acq_before)
    finally:
        client.delete(f"{API}/customers/{cust['id']}")
        client.delete(f"{API}/parts/{part['id']}")


def test_delete_refurbished_keep_sale(client):
    cust = _mk_customer(client)
    ref = _mk_refurb(client, cost=100.0, target=300.0)
    try:
        client.post(f"{API}/refurbished/{ref['id']}/open-repair", json={})
        sell_resp = client.post(f"{API}/refurbished/{ref['id']}/sell", json={"sale_price": 250.0, "customer_id": cust["id"]})
        sale_id = sell_resp.json()["sale_id"]

        # delete_sale=false -> sale should remain
        d = client.delete(f"{API}/refurbished/{ref['id']}?delete_sale=false&restore_parts=false")
        assert d.status_code == 200
        sales = client.get(f"{API}/sales").json()
        assert any(s["id"] == sale_id for s in sales)
        # cleanup sale
        client.delete(f"{API}/sales/{sale_id}")
    finally:
        client.delete(f"{API}/customers/{cust['id']}")


# ---- 7. sync_refurb_sale_cost on repair update ----
def test_refurb_sale_cost_syncs_on_repair_update(client):
    part = _mk_part(client, qty=10, sell=20.0)
    cust = _mk_customer(client)
    ref = _mk_refurb(client, cost=100.0, target=300.0)
    try:
        r = client.post(f"{API}/refurbished/{ref['id']}/open-repair", json={}).json()
        repair_id = r["repair"]["id"]
        # sell first
        sell_resp = client.post(f"{API}/refurbished/{ref['id']}/sell", json={"sale_price": 300.0, "customer_id": cust["id"]})
        sale_id = sell_resp.json()["sale_id"]

        # add parts after selling -> should sync
        client.put(f"{API}/repairs/{repair_id}", json={
            "parts_used": [{"part_id": part["id"], "part_name": part["name"], "quantity": 1, "unit_price": 20.0, "surcharge": 5.0}],
        })
        sale = next(s for s in client.get(f"{API}/sales").json() if s["id"] == sale_id)
        assert sale["cost_total"] == 125.0  # 100 + (20+5)
        assert sale["margin"] == 175.0
    finally:
        client.delete(f"{API}/refurbished/{ref['id']}?delete_sale=true&restore_parts=true")
        client.delete(f"{API}/customers/{cust['id']}")
        client.delete(f"{API}/parts/{part['id']}")
