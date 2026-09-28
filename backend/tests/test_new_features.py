"""Regression tests for new features: Suppliers, PurchaseOrders, Refurbished."""
import pytest
from conftest import API


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
@pytest.fixture
def order_ctx(client, temp_part):
    sup = client.post(f"{API}/suppliers", json={"name": "TEST_Fornitore ORD"}).json()
    part = temp_part(name="TEST_PartOrd", quantity=5, cost_price=2.0, sell_price=5.0)
    o = client.post(f"{API}/purchase-orders", json={
        "supplier_id": sup["id"], "supplier_name": sup["name"],
        "items": [
            {"part_id": part["id"], "description": "TEST_PartOrd", "quantity": 10, "unit_cost": 2.0},
            {"description": "TEST_freeItem", "quantity": 2, "unit_cost": 3.0},
        ],
        "status": "ordinato",
    }).json()
    yield {"supplier": sup, "part": part, "order": o}
    client.delete(f"{API}/purchase-orders/{o['id']}")
    client.delete(f"{API}/suppliers/{sup['id']}")


def receive(client, oid, lines):
    r = client.post(f"{API}/purchase-orders/{oid}/receive", json={"items": lines})
    assert r.status_code == 200, r.text
    return r.json()


class TestPurchaseOrders:
    def test_order_created_with_total(self, order_ctx):
        o = order_ctx["order"]
        assert o["order_number"].startswith("ORD-")
        assert o["total"] == 26.0
        assert o["status"] == "ordinato"

    def test_partial_receive_sets_parziale_and_stock(self, client, order_ctx):
        o = receive(client, order_ctx["order"]["id"], [{"index": 0, "quantity": 4}])
        assert o["status"] == "parziale"
        assert client.get(f"{API}/parts/{order_ctx['part']['id']}").json()["quantity"] == 9

    def test_partial_receive_records_cash(self, client, order_ctx):
        oid = order_ctx["order"]["id"]
        receive(client, oid, [{"index": 0, "quantity": 4}])
        matches = [m for m in client.get(f"{API}/cash").json() if m.get("reference_id") == oid and m["type"] == "uscita"]
        assert any(abs(m["amount"] - 8.0) < 0.01 for m in matches)

    def test_full_receive_sets_ricevuto(self, client, order_ctx):
        oid = order_ctx["order"]["id"]
        o = receive(client, oid, [{"index": 0, "quantity": 10}, {"index": 1, "quantity": 2}])
        assert o["status"] == "ricevuto"
        assert o.get("received_at")
        assert client.get(f"{API}/parts/{order_ctx['part']['id']}").json()["quantity"] == 15

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
@pytest.fixture
def refurb(client):
    r = client.post(f"{API}/refurbished", json={
        "device_type": "smartphone", "brand": "TEST_Apple", "model": "iPhoneT",
        "purchase_cost": 100.0, "target_price": 200.0,
    })
    assert r.status_code == 200, r.text
    dev = r.json()
    yield dev
    fresh = client.get(f"{API}/refurbished/{dev['id']}").json()
    if fresh.get("sale_id"):
        client.delete(f"{API}/sales/{fresh['sale_id']}")
    client.delete(f"{API}/refurbished/{dev['id']}")


def add_cost(client, rid, amount=20.0):
    c = client.post(f"{API}/refurbished/{rid}/costs", json={"description": "TEST_batteria", "amount": amount})
    assert c.status_code == 200, c.text
    return c.json()


def sell(client, rid, price=250.0):
    r = client.post(f"{API}/refurbished/{rid}/sell", json={"sale_price": price, "customer_name": "TEST_Cliente Ref"})
    assert r.status_code == 200, r.text
    return r.json()


class TestRefurbished:
    def test_create_defaults(self, refurb):
        assert refurb["code"].startswith("RIC-")
        assert refurb["total_cost"] == 100.0
        assert refurb["status"] == "acquistato"

    def test_create_records_purchase_cash(self, client, refurb):
        cash = client.get(f"{API}/cash").json()
        assert any(m.get("reference_id") == refurb["id"] and m["type"] == "uscita" and m["amount"] == 100.0 for m in cash)

    def test_add_cost_increases_total(self, client, refurb):
        cd = add_cost(client, refurb["id"])
        assert cd["total_cost"] == 120.0
        assert len(cd["refurb_costs"]) == 1

    def test_summary_includes_stock(self, client, refurb):
        add_cost(client, refurb["id"])
        summ = client.get(f"{API}/refurbished/summary").json()
        assert summ["in_stock"] >= 1
        assert summ["stock_value"] >= 120.0

    def test_sell_sets_margin_and_sale(self, client, refurb):
        add_cost(client, refurb["id"])
        sd = sell(client, refurb["id"])
        assert sd["status"] == "venduto"
        assert sd["margin"] == 130.0
        sale = client.get(f"{API}/sales/{sd['sale_id']}").json()
        assert sale["invoice_number"].startswith("VEN-")
        assert sale["total"] == 250.0

    def test_sell_records_cash_entry(self, client, refurb):
        sd = sell(client, refurb["id"])
        cash = client.get(f"{API}/cash").json()
        assert any(m.get("reference_id") == sd["sale_id"] and m["type"] == "entrata" and m["amount"] == 250.0 for m in cash)

    def test_sell_twice_400(self, client, refurb):
        sell(client, refurb["id"])
        again = client.post(f"{API}/refurbished/{refurb['id']}/sell", json={"sale_price": 300.0})
        assert again.status_code == 400

    def test_get_404(self, client):
        r = client.get(f"{API}/refurbished/nope")
        assert r.status_code == 404

    def test_sell_404(self, client):
        r = client.post(f"{API}/refurbished/nope/sell", json={"sale_price": 1.0})
        assert r.status_code == 404
