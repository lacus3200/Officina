"""Iter11: backup validate/import with exclusions, cross-entity propagation, cash date sources."""
import pytest
from tests.conftest import API


# ---------- Backup validate ----------
def test_backup_validate_reports_errors_and_warnings(client):
    payload = {
        "mode": "merge",
        "collections": {
            "customers": [
                {"id": "TESTx1", "name": "OK"},
                {"id": "TESTx1", "name": ""},          # duplicate id + missing name
                {"name": "NoId", "foo": 1},            # missing id + unknown field
            ],
            "repairs": [
                {"id": "TESTr9", "ticket_number": "RIP-TEST", "device_type": "Smartphone",
                 "problem": "p", "status": "boh", "customer_id": "nope"},
            ],
            "weird": [],
        },
    }
    r = client.post(f"{API}/backup/validate", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    assert set(data.keys()) >= {"ok", "errors", "warnings", "issues"}
    assert data["ok"] is False and data["errors"] >= 3
    sev = {(i["collection"], i["field"], i["severity"]) for i in data["issues"]}
    # duplicate + missing name + missing id + invalid enum
    assert any(c == "customers" and f == "id" for c, f, _ in sev)
    assert any(c == "customers" and f == "name" for c, f, _ in sev)
    assert any(c == "repairs" and f == "status" for c, f, _ in sev)
    # unknown collection -> warning; unknown field foo -> warning; ref customer 'nope' -> warning
    assert any(c == "weird" and s == "warning" for c, _, s in sev)
    assert any(f and "foo" in f and s == "warning" for _, f, s in sev)
    assert any(c == "repairs" and f == "customer_id" and s == "warning" for c, f, s in sev)


def test_backup_import_merge_upserts(client):
    # cleanup
    client.delete(f"{API}/customers/TESTbk1")
    client.delete(f"{API}/customers/TESTbk2")
    payload = {"mode": "merge", "collections": {"customers": [
        {"id": "TESTbk1", "name": "Bk One"},
        {"id": "TESTbk2", "name": "Bk Two"},
    ]}}
    r = client.post(f"{API}/backup/import", json=payload)
    assert r.status_code == 200, r.text
    assert r.json()["imported"]["customers"] == 2
    got = {c["id"]: c["name"] for c in client.get(f"{API}/customers").json() if c["id"].startswith("TESTbk")}
    assert got == {"TESTbk1": "Bk One", "TESTbk2": "Bk Two"}
    client.delete(f"{API}/customers/TESTbk1")
    client.delete(f"{API}/customers/TESTbk2")


# ---------- Customer rename/delete propagation ----------
def test_rename_customer_propagates_to_repairs_and_sales(client, temp_part):
    c = client.post(f"{API}/customers", json={"name": "TEST_Rossi"}).json()
    rep = client.post(f"{API}/repairs", json={
        "customer_id": c["id"], "customer_name": c["name"],
        "device_type": "Smartphone", "device_brand": "Samsung", "device_model": "S23",
        "problem": "schermo",
    }).json()
    part = temp_part(quantity=10, sell_price=5.0)
    sale = client.post(f"{API}/sales", json={
        "customer_id": c["id"], "customer_name": c["name"],
        "items": [{"part_id": part["id"], "description": part["name"], "quantity": 1, "unit_price": 5.0}],
        "total": 5.0,
    }).json()
    assert "id" in sale, sale
    try:
        r = client.put(f"{API}/customers/{c['id']}", json={"name": "TEST_Bianchi"})
        assert r.status_code == 200
        assert client.get(f"{API}/repairs/{rep['id']}").json()["customer_name"] == "TEST_Bianchi"
        assert client.get(f"{API}/sales/{sale['id']}").json()["customer_name"] == "TEST_Bianchi"
        # delete customer -> customer_id becomes None but records remain
        client.delete(f"{API}/customers/{c['id']}")
        assert client.get(f"{API}/repairs/{rep['id']}").json()["customer_id"] is None
        assert client.get(f"{API}/sales/{sale['id']}").json()["customer_id"] is None
    finally:
        client.delete(f"{API}/repairs/{rep['id']}")
        client.delete(f"{API}/sales/{sale['id']}")
        client.delete(f"{API}/customers/{c['id']}")


# ---------- Part rename propagates to parts_used.part_name ----------
def test_rename_part_propagates_to_repair_parts_used(client, temp_part):
    part = temp_part(name="TEST_Vite_A", quantity=5, cost_price=1.0, sell_price=2.0)
    rep = client.post(f"{API}/repairs", json={
        "device_type": "Smartphone", "device_brand": "X", "device_model": "Y", "problem": "p",
        "parts_used": [{"part_id": part["id"], "part_name": "TEST_Vite_A", "quantity": 1, "unit_cost": 1.0, "unit_price": 2.0}],
    }).json()
    try:
        r = client.put(f"{API}/parts/{part['id']}", json={
            "name": "TEST_Vite_B", "quantity": 5, "min_quantity": 0, "cost_price": 1.0, "sell_price": 2.0,
        })
        assert r.status_code == 200, r.text
        got = client.get(f"{API}/repairs/{rep['id']}").json()
        assert got["parts_used"][0]["part_name"] == "TEST_Vite_B"
    finally:
        client.delete(f"{API}/repairs/{rep['id']}")


# ---------- Refurbished <-> Repair / Sale linking ----------
def test_delete_repair_nulls_refurb_repair_id(client):
    refurb = client.post(f"{API}/refurbished", json={
        "device_type": "Smartphone", "device_brand": "X", "device_model": "Y", "purchase_cost": 10.0,
    }).json()
    rep = client.post(f"{API}/refurbished/{refurb['id']}/open-repair", json={"problem": "TEST"}).json()["repair"]
    try:
        assert client.get(f"{API}/refurbished/{refurb['id']}").json()["repair_id"] == rep["id"]
        client.delete(f"{API}/repairs/{rep['id']}")
        assert client.get(f"{API}/refurbished/{refurb['id']}").json()["repair_id"] is None
    finally:
        client.delete(f"{API}/refurbished/{refurb['id']}")


def test_delete_sale_restores_refurb_to_pronto(client):
    refurb = client.post(f"{API}/refurbished", json={
        "device_type": "Smartphone", "device_brand": "X", "device_model": "Y",
        "purchase_cost": 10.0, "status": "pronto", "target_price": 100.0,
    }).json()
    sell_resp = client.post(f"{API}/refurbished/{refurb['id']}/sell", json={"sale_price": 100.0}).json()
    sale_id = sell_resp["sale_id"]
    try:
        r = client.get(f"{API}/refurbished/{refurb['id']}").json()
        assert r["status"] == "venduto" and r["sale_id"] == sale_id
        client.delete(f"{API}/sales/{sale_id}")
        r = client.get(f"{API}/refurbished/{refurb['id']}").json()
        assert r["status"] == "pronto" and (r.get("sale_id") in (None, ""))
    finally:
        client.delete(f"{API}/refurbished/{refurb['id']}")


# ---------- Cash date sources ----------
def _cash_for(client, ref_id):
    return [m for m in client.get(f"{API}/cash").json() if m.get("reference_id") == ref_id]


def test_repair_cash_uses_delivered_at_and_updates_on_change(client):
    rep = client.post(f"{API}/repairs", json={
        "device_type": "Smartphone", "device_brand": "Samsung", "device_model": "S23",
        "problem": "p", "status": "consegnata", "paid": True,
        "final_price": 80.0, "delivered_at": "2026-01-15T10:00:00",
    }).json()
    try:
        client.post(f"{API}/cash/sync")
        movs = _cash_for(client, rep["id"])
        assert movs and movs[0]["date"].startswith("2026-01-15"), movs
        assert "Samsung" in movs[0]["description"] and "S23" in movs[0]["description"]
        # change delivered_at via PUT
        client.put(f"{API}/repairs/{rep['id']}", json={"delivered_at": "2026-02-20T10:00:00"})
        movs = _cash_for(client, rep["id"])
        assert movs[0]["date"].startswith("2026-02-20"), movs
        # change device_brand -> description updates
        client.put(f"{API}/repairs/{rep['id']}", json={"device_brand": "Apple", "device_model": "iPhone 15"})
        movs = _cash_for(client, rep["id"])
        assert "Apple" in movs[0]["description"] and "iPhone 15" in movs[0]["description"]
    finally:
        client.delete(f"{API}/repairs/{rep['id']}")


def test_part_cash_uses_entered_at(client, temp_part):
    part = temp_part(name="TEST_part_date", quantity=2, cost_price=5.0, sell_price=10.0, entered_at="2026-01-10T09:00:00")
    client.post(f"{API}/cash/sync")
    movs = [m for m in client.get(f"{API}/cash").json()
            if m.get("category") == "acquisto_ricambi" and part["id"] in (m.get("reference_id") or "")]
    assert movs, "no cash movement for part purchase"
    assert movs[0]["date"].startswith("2026-01-10"), movs


def test_cash_sync_is_idempotent(client):
    r1 = client.post(f"{API}/cash/sync").json()
    r2 = client.post(f"{API}/cash/sync").json()
    # Second run should not change totals
    assert r1.get("summary") == r2.get("summary") or r1 == r2
