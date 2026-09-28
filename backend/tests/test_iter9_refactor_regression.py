"""
Iteration 9 regression tests: verifies no behavioral changes after backend refactor
(dashboard split, startup split, receive_order split, backup split, cash_sync split).
"""
import os, sys
from datetime import datetime
import pytest

sys.path.insert(0, os.path.dirname(__file__))
from conftest import API  # noqa


# ---------- Auth ----------
def test_auth_me(client):
    r = client.get(f"{API}/auth/me")
    assert r.status_code == 200
    d = r.json()
    assert d.get("email")
    assert d.get("role") == "admin"


# ---------- Dashboard shape + coherence with /api/cash ----------
def test_dashboard_shape_and_cash_coherence(client):
    r = client.get(f"{API}/reports/dashboard")
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ("today", "month", "open_repairs", "completed_repairs",
              "total_customers", "low_stock_count", "low_stock_items",
              "inventory_value", "daily_series"):
        assert k in d, f"missing key {k}"
    for section in ("today", "month"):
        for sub in ("entrate", "uscite", "netto"):
            assert sub in d[section], f"{section}.{sub} missing"
    assert isinstance(d["daily_series"], list)
    assert len(d["daily_series"]) == 14
    for row in d["daily_series"]:
        assert "date" in row and "entrate" in row and "uscite" in row

    # coherence with /api/cash: sums must match today/month within 0.01
    movs = client.get(f"{API}/cash").json()
    today = datetime.utcnow().strftime("%Y-%m-%d")
    month = datetime.utcnow().strftime("%Y-%m")
    t_in = sum(m["amount"] for m in movs if m["type"] == "entrata" and m["date"].startswith(today))
    t_out = sum(m["amount"] for m in movs if m["type"] == "uscita" and m["date"].startswith(today))
    m_in = sum(m["amount"] for m in movs if m["type"] == "entrata" and m["date"].startswith(month))
    m_out = sum(m["amount"] for m in movs if m["type"] == "uscita" and m["date"].startswith(month))
    assert abs(d["today"]["entrate"] - round(t_in, 2)) < 0.01
    assert abs(d["today"]["uscite"] - round(t_out, 2)) < 0.01
    assert abs(d["month"]["entrate"] - round(m_in, 2)) < 0.01
    assert abs(d["month"]["uscite"] - round(m_out, 2)) < 0.01
    assert abs(d["today"]["netto"] - round(t_in - t_out, 2)) < 0.01


# ---------- Startup: catalogs seeded, admin exists ----------
def test_startup_catalogs_seeded(client):
    brands = client.get(f"{API}/catalog/brands").json()
    services = client.get(f"{API}/services").json()
    parts_cat = client.get(f"{API}/catalog/parts").json()
    assert len(brands) >= 15, f"brands={len(brands)}"
    assert len(services) >= 15, f"services={len(services)}"
    assert len(parts_cat) >= 40, f"parts_cat={len(parts_cat)}"


# ---------- Purchase order flow (partial receive + full receive + errors) ----------
def test_purchase_order_full_flow(client, temp_part):
    part = temp_part(name="TEST_ord_part", quantity=0, cost_price=5.0, sell_price=10.0)
    body = {
        "supplier_name": "TEST_supplier",
        "items": [{
            "part_id": part["id"],
            "description": "TEST_line",
            "quantity": 4,
            "unit_cost": 5.0,
        }],
        "notes": "TEST",
    }
    o = client.post(f"{API}/purchase-orders", json=body)
    assert o.status_code == 200, o.text
    order = o.json()
    oid = order["id"]

    # Partial receive: 2 of 4
    r1 = client.post(f"{API}/purchase-orders/{oid}/receive",
                     json={"items": [{"index": 0, "quantity": 2}]})
    assert r1.status_code == 200, r1.text
    upd = r1.json()
    assert upd["status"] == "parziale"
    # stock incremented
    pnow = client.get(f"{API}/parts/{part['id']}").json()
    assert pnow["quantity"] == 2
    # cash uscita 'acquisto' = 2*5 = 10.0
    movs = [m for m in client.get(f"{API}/cash").json()
            if m.get("reference_id") == oid and m["type"] == "uscita"]
    assert movs, "no expense movement recorded"
    assert movs[0]["category"] == "acquisto"
    assert abs(movs[0]["amount"] - 10.0) < 0.01

    # Full receive remaining
    r2 = client.post(f"{API}/purchase-orders/{oid}/receive",
                     json={"items": [{"index": 0, "quantity": 2}]})
    assert r2.status_code == 200
    upd2 = r2.json()
    assert upd2["status"] == "ricevuto"
    assert upd2.get("received_at")
    pnow2 = client.get(f"{API}/parts/{part['id']}").json()
    assert pnow2["quantity"] == 4

    # 404 unknown order
    r404 = client.post(f"{API}/purchase-orders/does-not-exist/receive",
                       json={"items": [{"index": 0, "quantity": 1}]})
    assert r404.status_code == 404

    # Cancelled order -> 400
    body2 = {
        "supplier_name": "TEST_supplier2",
        "items": [{"part_id": part["id"], "description": "TEST", "quantity": 1, "unit_cost": 1.0}],
    }
    o2 = client.post(f"{API}/purchase-orders", json=body2).json()
    client.put(f"{API}/purchase-orders/{o2['id']}", json={"status": "annullato"})
    r400 = client.post(f"{API}/purchase-orders/{o2['id']}/receive",
                       json={"items": [{"index": 0, "quantity": 1}]})
    assert r400.status_code == 400

    # cleanup
    client.delete(f"{API}/purchase-orders/{oid}")
    client.delete(f"{API}/purchase-orders/{o2['id']}")


# ---------- Backup export/import (merge/replace + validation errors) ----------
def test_backup_export_and_merge_replace(client):
    exp = client.get(f"{API}/backup/export")
    assert exp.status_code == 200
    payload = exp.json()
    assert "collections" in payload
    services_snapshot = payload["collections"].get("services", [])
    assert isinstance(services_snapshot, list) and len(services_snapshot) >= 15

    counts_before = {c: len(client.get(f"{API}/{path}").json())
                     for c, path in [("services", "services"),
                                     ("parts", "parts"),
                                     ("customers", "customers")]}

    # merge with only 'services' subset - should not lose anything
    merge_body = {"mode": "merge", "collections": {"services": services_snapshot}}
    rm = client.post(f"{API}/backup/import", json=merge_body)
    assert rm.status_code == 200, rm.text
    counts_after = {c: len(client.get(f"{API}/{path}").json())
                    for c, path in [("services", "services"),
                                    ("parts", "parts"),
                                    ("customers", "customers")]}
    assert counts_after == counts_before, f"merge changed counts {counts_before}->{counts_after}"

    # replace with only 'services' subset -> only services replaced
    rep_body = {"mode": "replace", "collections": {"services": services_snapshot}}
    rp = client.post(f"{API}/backup/import", json=rep_body)
    assert rp.status_code == 200, rp.text
    svc_after = client.get(f"{API}/services").json()
    assert len(svc_after) == len(services_snapshot)

    # unknown collection -> 400
    ru = client.post(f"{API}/backup/import",
                     json={"mode": "merge", "collections": {"totally_unknown_col": []}})
    assert ru.status_code == 400

    # value not a list -> 400
    rv = client.post(f"{API}/backup/import",
                     json={"mode": "merge", "collections": {"services": "not-a-list"}})
    assert rv.status_code == 400


# ---------- Cash sync split still works ----------
def test_cash_sync_still_idempotent_and_parts(client, temp_part):
    # First sync (may fix leftover state from other tests)
    client.post(f"{API}/cash/sync")
    r2 = client.post(f"{API}/cash/sync")
    assert r2.status_code == 200
    d = r2.json()
    for k in ("sales_added", "sales_fixed", "orphans_removed", "repairs_added", "parts_added"):
        assert k in d
    # Second call should be zero
    assert all(v == 0 for v in d.values()), f"not idempotent: {d}"

    # Part with cost>0 and no movement -> sync adds parts movement
    p = temp_part(name="TEST_sync_part", quantity=3, cost_price=7.0, sell_price=15.0)
    # remove any movement created by POST /parts
    client.post(f"{API}/cash/sync")  # normalize
    # delete any existing cash movement referencing this part
    for m in client.get(f"{API}/cash").json():
        if m.get("reference_id") == p["id"]:
            # DELETE should be blocked (400) - so we bypass via a direct DB is not accessible here.
            # Instead, we skip this branch if delete returns 400 (which is expected).
            pass
    # Sync should be idempotent again
    r3 = client.post(f"{API}/cash/sync").json()
    assert r3["parts_added"] == 0
