"""Regression tests for new features: Suppliers, PurchaseOrders, Refurbished."""
import os
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://tech-workshop-13.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@lab.local"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"})
    return s


# ---------- Suppliers CRUD ----------
class TestSuppliers:
    def test_crud(self, client):
        r = client.post(f"{API}/suppliers", json={"name": "TEST_Fornitore A", "phone": "0111111111", "email": "a@t.local"})
        assert r.status_code == 200, r.text
        sup = r.json()
        assert sup["name"] == "TEST_Fornitore A"
        sid = sup["id"]

        lst = client.get(f"{API}/suppliers").json()
        assert any(x["id"] == sid for x in lst)

        u = client.put(f"{API}/suppliers/{sid}", json={"name": "TEST_Fornitore A", "phone": "0299999999"})
        assert u.status_code == 200 and u.json()["phone"] == "0299999999"

        # 404 on missing update
        nf = client.put(f"{API}/suppliers/does-not-exist", json={"name": "x"})
        assert nf.status_code == 404

        d = client.delete(f"{API}/suppliers/{sid}")
        assert d.status_code == 200


# ---------- Purchase orders full flow ----------
class TestPurchaseOrders:
    def test_order_lifecycle_stock_and_cash(self, client):
        # supplier
        sup = client.post(f"{API}/suppliers", json={"name": "TEST_Fornitore ORD"}).json()
        # part with initial qty
        part = client.post(f"{API}/parts", json={
            "name": "TEST_PartOrd", "quantity": 5, "min_quantity": 0,
            "cost_price": 2.0, "sell_price": 5.0,
        }).json()
        pid = part["id"]

        order = client.post(f"{API}/purchase-orders", json={
            "supplier_id": sup["id"], "supplier_name": sup["name"],
            "items": [
                {"part_id": pid, "description": "TEST_PartOrd", "quantity": 10, "unit_cost": 2.0},
                {"description": "TEST_freeItem", "quantity": 2, "unit_cost": 3.0},
            ],
            "status": "ordinato",
        })
        assert order.status_code == 200, order.text
        o = order.json()
        assert o["order_number"].startswith("ORD-")
        assert o["total"] == 26.0  # 10*2 + 2*3
        assert o["status"] == "ordinato"
        oid = o["id"]

        # Partial receive 4 of first item
        rec1 = client.post(f"{API}/purchase-orders/{oid}/receive",
                           json={"items": [{"index": 0, "quantity": 4}]})
        assert rec1.status_code == 200, rec1.text
        assert rec1.json()["status"] == "parziale"

        # Part stock incremented by 4 -> 9
        p_after = client.get(f"{API}/parts/{pid}").json()
        assert p_after["quantity"] == 9

        # Cash entry created (uscita acquisto = 4*2 = 8)
        cash = client.get(f"{API}/cash").json()
        matches = [m for m in cash if m.get("reference_id") == oid and m["type"] == "uscita"]
        assert len(matches) >= 1
        assert any(abs(m["amount"] - 8.0) < 0.01 for m in matches)

        # Receive remaining
        rec2 = client.post(f"{API}/purchase-orders/{oid}/receive",
                           json={"items": [{"index": 0, "quantity": 6}, {"index": 1, "quantity": 2}]})
        assert rec2.status_code == 200
        assert rec2.json()["status"] == "ricevuto"
        assert rec2.json().get("received_at")

        p_final = client.get(f"{API}/parts/{pid}").json()
        assert p_final["quantity"] == 15  # 5 + 10

        # cleanup
        client.delete(f"{API}/purchase-orders/{oid}")
        client.delete(f"{API}/parts/{pid}")
        client.delete(f"{API}/suppliers/{sup['id']}")

    def test_receive_annullato_400(self, client):
        o = client.post(f"{API}/purchase-orders", json={
            "items": [{"description": "TEST_x", "quantity": 1, "unit_cost": 1.0}],
            "status": "annullato",
        }).json()
        r = client.post(f"{API}/purchase-orders/{o['id']}/receive", json={"items": [{"index": 0, "quantity": 1}]})
        assert r.status_code == 400
        client.delete(f"{API}/purchase-orders/{o['id']}")

    def test_receive_404(self, client):
        r = client.post(f"{API}/purchase-orders/nope/receive", json={"items": []})
        assert r.status_code == 404


# ---------- Refurbished full flow ----------
class TestRefurbished:
    def test_create_costs_sell_flow(self, client):
        # create
        r = client.post(f"{API}/refurbished", json={
            "device_type": "smartphone", "brand": "TEST_Apple", "model": "iPhoneT",
            "purchase_cost": 100.0, "target_price": 200.0,
        })
        assert r.status_code == 200, r.text
        dev = r.json()
        assert dev["code"].startswith("RIC-")
        assert dev["total_cost"] == 100.0
        assert dev["status"] == "acquistato"
        rid = dev["id"]

        # cash uscita acquisto exists
        cash = client.get(f"{API}/cash").json()
        assert any(m.get("reference_id") == rid and m["type"] == "uscita" and m["amount"] == 100.0 for m in cash)

        # add refurb cost
        c = client.post(f"{API}/refurbished/{rid}/costs", json={"description": "TEST_batteria", "amount": 20.0})
        assert c.status_code == 200
        cd = c.json()
        assert cd["total_cost"] == 120.0
        assert len(cd["refurb_costs"]) == 1
        cost_id = cd["refurb_costs"][0]["id"]

        # summary in_stock >=1 and stock_value includes 120
        summ = client.get(f"{API}/refurbished/summary").json()
        assert summ["in_stock"] >= 1
        assert summ["stock_value"] >= 120.0

        # sell
        sell = client.post(f"{API}/refurbished/{rid}/sell", json={
            "sale_price": 250.0, "customer_name": "TEST_Cliente Ref",
        })
        assert sell.status_code == 200, sell.text
        sd = sell.json()
        assert sd["status"] == "venduto"
        assert sd["margin"] == round(250.0 - 120.0, 2)
        assert sd.get("sale_id")

        # sale record exists
        sale = client.get(f"{API}/sales/{sd['sale_id']}").json()
        assert sale["invoice_number"].startswith("VEN-")
        assert sale["total"] == 250.0

        # cash entrata vendita exists
        cash2 = client.get(f"{API}/cash").json()
        assert any(m.get("reference_id") == sd["sale_id"] and m["type"] == "entrata" and m["amount"] == 250.0 for m in cash2)

        # sell twice -> 400
        again = client.post(f"{API}/refurbished/{rid}/sell", json={"sale_price": 300.0})
        assert again.status_code == 400

        # delete cost after sell (cleanup path)
        client.delete(f"{API}/refurbished/{rid}/costs/{cost_id}")

        # cleanup
        client.delete(f"{API}/sales/{sd['sale_id']}")
        client.delete(f"{API}/refurbished/{rid}")

    def test_get_404(self, client):
        r = client.get(f"{API}/refurbished/nope")
        assert r.status_code == 404

    def test_sell_404(self, client):
        r = client.post(f"{API}/refurbished/nope/sell", json={"sale_price": 1.0})
        assert r.status_code == 404
