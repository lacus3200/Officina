"""Backend regression tests for Laboratorio Elettronica app.

Covers: auth, customers CRUD, parts CRUD + low_stock filter, repairs
partial updates -> consegnata+paid triggers cash entry, sales creation
decrements stock + creates cash, cash movements, dashboard series.
"""
import requests

from conftest import API, ADMIN_EMAIL


# ---------- Auth ----------
class TestAuth:
    def test_login_bad_credentials(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_me(self, client):
        r = client.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL

    def test_me_requires_auth(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401


# ---------- Customers ----------
class TestCustomers:
    def test_crud(self, client):
        payload = {"name": "TEST_Mario Rossi", "phone": "3331112233", "email": "mario@test.local"}
        r = client.post(f"{API}/customers", json=payload)
        assert r.status_code == 200, r.text
        cust = r.json()
        assert cust["name"] == payload["name"]
        cid = cust["id"]

        g = client.get(f"{API}/customers/{cid}")
        assert g.status_code == 200 and g.json()["phone"] == "3331112233"

        u = client.put(f"{API}/customers/{cid}", json={"name": "TEST_Mario Rossi", "phone": "9990000000"})
        assert u.status_code == 200 and u.json()["phone"] == "9990000000"

        d = client.delete(f"{API}/customers/{cid}")
        assert d.status_code == 200
        assert client.get(f"{API}/customers/{cid}").status_code == 404


# ---------- Parts ----------
class TestParts:
    def test_crud_and_low_stock(self, client):
        p = client.post(f"{API}/parts", json={
            "name": "TEST_Condensatore",
            "condition": "nuovo",
            "status": "disponibile",
            "quantity": 1,
            "min_quantity": 5,
            "cost_price": 0.5,
            "sell_price": 2.0,
        })
        assert p.status_code == 200, p.text
        pid = p.json()["id"]
        assert p.json()["condition"] == "nuovo"

        low = client.get(f"{API}/parts", params={"low_stock": "true"})
        assert low.status_code == 200
        ids = [x["id"] for x in low.json()]
        assert pid in ids, "part with qty<min_qty should appear in low_stock"

        u = client.put(f"{API}/parts/{pid}", json={"name": "TEST_Condensatore", "quantity": 20, "min_quantity": 5, "condition": "usato", "status": "disponibile"})
        assert u.status_code == 200 and u.json()["quantity"] == 20 and u.json()["condition"] == "usato"

        client.delete(f"{API}/parts/{pid}")


# ---------- Repairs partial update -> cash ----------
class TestRepairs:
    def test_create_partial_update_and_cash(self, client):
        r = client.post(f"{API}/repairs", json={
            "device_type": "smartphone",
            "device_brand": "Test",
            "problem": "TEST no power",
            "estimate": 50.0,
            "final_price": 80.0,
        })
        assert r.status_code == 200, r.text
        rep = r.json()
        assert rep["ticket_number"].startswith("RIP-")
        rid = rep["id"]

        # Partial update: change only status - should NOT fail
        u1 = client.put(f"{API}/repairs/{rid}", json={"status": "in_lavorazione"})
        assert u1.status_code == 200, u1.text
        assert u1.json()["status"] == "in_lavorazione"
        assert u1.json()["problem"] == "TEST no power"  # preserved

        # Deliver + paid
        u2 = client.put(f"{API}/repairs/{rid}", json={"status": "consegnata", "paid": True})
        assert u2.status_code == 200, u2.text
        assert u2.json()["status"] == "consegnata"
        assert u2.json().get("delivered_at")

        # Verify cash entry created
        cash = client.get(f"{API}/cash").json()
        matches = [m for m in cash if m.get("reference_id") == rid and m.get("category") == "riparazione"]
        assert len(matches) == 1
        assert matches[0]["type"] == "entrata"
        assert matches[0]["amount"] == 80.0

        # Idempotent: second call doesn't duplicate
        client.put(f"{API}/repairs/{rid}", json={"status": "consegnata", "paid": True})
        cash2 = client.get(f"{API}/cash").json()
        matches2 = [m for m in cash2 if m.get("reference_id") == rid and m.get("category") == "riparazione"]
        assert len(matches2) == 1

        client.delete(f"{API}/repairs/{rid}")


# ---------- Sales decrement stock + cash ----------
class TestSales:
    def test_sale_decrements_stock_creates_cash(self, client):
        p = client.post(f"{API}/parts", json={
            "name": "TEST_Resistenza",
            "quantity": 10,
            "min_quantity": 0,
            "cost_price": 0.1,
            "sell_price": 1.0,
        }).json()
        pid = p["id"]

        sale = client.post(f"{API}/sales", json={
            "customer_name": "TEST_Cliente",
            "items": [{"part_id": pid, "description": "TEST_Resistenza", "quantity": 3, "unit_price": 1.0}],
            "cost_total": 0.3,
        })
        assert sale.status_code == 200, sale.text
        s = sale.json()
        assert s["invoice_number"].startswith("VEN-")
        assert s["total"] == 3.0

        # stock decremented
        updated_part = client.get(f"{API}/parts/{pid}").json()
        assert updated_part["quantity"] == 7

        # cash entry
        cash = client.get(f"{API}/cash").json()
        matches = [m for m in cash if m.get("reference_id") == s["id"]]
        assert len(matches) == 1
        assert matches[0]["amount"] == 3.0

        client.delete(f"{API}/sales/{s['id']}")
        client.delete(f"{API}/parts/{pid}")


# ---------- Cash ----------
class TestCash:
    def test_create_expense(self, client):
        r = client.post(f"{API}/cash", json={
            "type": "uscita",
            "category": "spesa",
            "amount": 25.5,
            "description": "TEST_bolletta",
        })
        assert r.status_code == 200 and r.json()["type"] == "uscita"
        mid = r.json()["id"]
        lst = client.get(f"{API}/cash").json()
        assert any(m["id"] == mid for m in lst)
        client.delete(f"{API}/cash/{mid}")


# ---------- Dashboard ----------
class TestDashboard:
    def test_dashboard_series(self, client):
        r = client.get(f"{API}/reports/dashboard")
        assert r.status_code == 200
        d = r.json()
        for k in ["today", "month", "open_repairs", "total_customers", "daily_series", "inventory_value"]:
            assert k in d
        assert isinstance(d["daily_series"], list) and len(d["daily_series"]) == 14
        assert set(["date", "entrate", "uscite"]).issubset(d["daily_series"][0].keys())
