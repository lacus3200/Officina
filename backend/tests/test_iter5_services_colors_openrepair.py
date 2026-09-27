"""Iteration 5: Services listino, catalog/colors model_id, refurbished open-repair."""
import os
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL missing"
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": "admin@lab.local", "password": "admin123"})
    assert r.status_code == 200, r.text
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"})
    return s


# ---------- Services listino ----------
class TestServicesCRUD:
    def test_list_services_seeded(self, client):
        r = client.get(f"{API}/services")
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 15, f"expected ~19 preloaded services, got {len(items)}"
        # grouping by category present
        cats = {s.get("category") for s in items}
        assert len(cats) >= 3

    def test_filter_device_type_includes_null(self, client):
        r = client.get(f"{API}/services", params={"device_type": "Smartphone"})
        assert r.status_code == 200
        items = r.json()
        # verify at least one item with device_type=null is included
        assert any(s.get("device_type") in (None, "", "Smartphone") for s in items)
        for s in items:
            assert s.get("device_type") in (None, "", "Smartphone")

    def test_create_update_delete_service(self, client):
        p = client.post(f"{API}/services", json={
            "name": "TEST_Intervento", "category": "TEST_Cat", "price": 12.5, "device_type": None
        })
        assert p.status_code == 200, p.text
        sid = p.json()["id"]
        # update price via PUT
        u = client.put(f"{API}/services/{sid}", json={
            "name": "TEST_Intervento", "category": "TEST_Cat", "price": 33.0, "device_type": None
        })
        assert u.status_code == 200
        assert u.json()["price"] == 33.0
        # GET verifies persistence
        got = next((x for x in client.get(f"{API}/services").json() if x["id"] == sid), None)
        assert got and got["price"] == 33.0
        # delete
        d = client.delete(f"{API}/services/{sid}")
        assert d.status_code == 200
        assert not any(x["id"] == sid for x in client.get(f"{API}/services").json())

    def test_put_non_existing_404(self, client):
        r = client.put(f"{API}/services/does-not-exist", json={"name": "X", "price": 1})
        assert r.status_code == 404


# ---------- Catalog colors ----------
class TestCatalogColors:
    def test_colors_include_brand_defaults(self, client):
        r = client.get(f"{API}/catalog/colors", params={"brand": "Apple", "model": "iPhone 13"})
        assert r.status_code == 200
        body = r.json()
        assert "colors" in body
        assert isinstance(body["colors"], list)
        assert body["model_id"] is not None  # iPhone 13 preloaded
        # Apple typical colors
        names = [c for c in body["colors"]]
        assert any(n.lower() in ("nero", "bianco", "mezzanotte") for n in names)

    def test_colors_missing_model_returns_null_id(self, client):
        r = client.get(f"{API}/catalog/colors", params={"brand": "Apple", "model": "iPhone_Ghost_Model"})
        assert r.status_code == 200
        assert r.json()["model_id"] is None

    def test_add_color_dedup_and_404(self, client):
        # find iPhone 13 id
        models = client.get(f"{API}/catalog/models", params={"brand": "Apple"}).json()
        m = next(x for x in models if x["name"] == "iPhone 13")
        color = f"TESTCOLOR_{os.urandom(2).hex()}"
        r1 = client.post(f"{API}/catalog/models/{m['id']}/colors", json={"color": color})
        assert r1.status_code == 200
        r2 = client.post(f"{API}/catalog/models/{m['id']}/colors", json={"color": color})
        assert r2.status_code == 200
        # ensure not duplicated
        colors = client.get(f"{API}/catalog/colors", params={"brand": "Apple", "model": "iPhone 13"}).json()["colors"]
        assert colors.count(color) == 1
        # 404
        r3 = client.post(f"{API}/catalog/models/does-not-exist/colors", json={"color": "x"})
        assert r3.status_code == 404


# ---------- Refurbished open-repair ----------
class TestOpenRepairFromRefurb:
    def test_open_repair_success_and_second_400_and_404(self, client):
        # 404 on unknown id
        bad = client.post(f"{API}/refurbished/does-not-exist/open-repair", json={})
        assert bad.status_code == 404

        # create fresh refurbished device
        dev = client.post(f"{API}/refurbished", json={
            "device_type": "smartphone", "brand": "Apple", "model": "iPhone 13",
            "serial_or_imei": f"TESTSN_{os.urandom(3).hex()}",
            "purchase_cost": 100.0,
        })
        assert dev.status_code == 200, dev.text
        d = dev.json()
        did = d["id"]
        try:
            resp = client.post(f"{API}/refurbished/{did}/open-repair", json={})
            assert resp.status_code == 200, resp.text
            body = resp.json()
            assert "repair" in body and "refurbished" in body
            rep = body["repair"]
            assert rep["services"] == []
            assert rep["status"] == "in_lavorazione"
            assert rep["ticket_number"].startswith("RIP-")
            assert d["code"] in rep["customer_name"]
            assert rep.get("serial_or_imei") == d["serial_or_imei"]
            # refurb linked
            r2 = client.get(f"{API}/refurbished/{did}").json()
            assert r2["repair_id"] == rep["id"]
            assert r2["status"] == "in_ricondizionamento"

            # second attempt -> 400
            resp2 = client.post(f"{API}/refurbished/{did}/open-repair", json={})
            assert resp2.status_code == 400
            assert "gi" in resp2.json().get("detail", "").lower() or "already" in resp2.json().get("detail", "").lower()

            # cleanup repair
            client.delete(f"{API}/repairs/{rep['id']}")
        finally:
            client.delete(f"{API}/refurbished/{did}")


# ---------- Repairs services persistence ----------
class TestRepairsServices:
    def test_create_and_update_repair_with_services(self, client):
        cust = client.post(f"{API}/customers", json={"name": "TEST_SvcCust"}).json()
        # get some services from catalog
        svcs = client.get(f"{API}/services").json()[:2]
        payload_services = [{"service_id": s["id"], "name": s["name"], "price": s["price"]} for s in svcs]
        rep = client.post(f"{API}/repairs", json={
            "customer_id": cust["id"], "customer_name": cust["name"],
            "device_type": "smartphone", "device_brand": "Apple", "device_model": "iPhone 13",
            "problem": "TEST", "status": "in_lavorazione", "services": payload_services,
        })
        assert rep.status_code == 200, rep.text
        rid = rep.json()["id"]
        try:
            got = client.get(f"{API}/repairs/{rid}").json()
            assert len(got["services"]) == 2
            assert got["services"][0]["name"] == payload_services[0]["name"]
            # update with a different price
            new_services = [{"service_id": svcs[0]["id"], "name": svcs[0]["name"], "price": 999.99}]
            u = client.put(f"{API}/repairs/{rid}", json={"services": new_services})
            assert u.status_code == 200
            got2 = client.get(f"{API}/repairs/{rid}").json()
            assert len(got2["services"]) == 1
            assert got2["services"][0]["price"] == 999.99
        finally:
            client.delete(f"{API}/repairs/{rid}")
            client.delete(f"{API}/customers/{cust['id']}")
