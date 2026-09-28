"""Backend tests for iteration 4 features:
- /api/catalog/brands + /api/catalog/models (GET/POST/DELETE + case-insensitive dedup)
- /api/devices/history (case-insensitive, <4 chars empty, exclude_id)
- /api/cash/{id}/reference (types + 404)
- PUT /api/repairs with received_at/delivered_at
- PUT /api/parts with entered_at/exited_at
- POST /api/refurbished with color + grade
"""
from conftest import API


class TestCatalog:
    def test_brands_seeded(self, client):
        r = client.get(f"{API}/catalog/brands")
        assert r.status_code == 200
        names = [b["name"] for b in r.json()]
        for expected in ["Apple", "Samsung", "Xiaomi"]:
            assert expected in names

    def test_models_for_apple_have_codes(self, client):
        r = client.get(f"{API}/catalog/models", params={"brand": "Apple"})
        assert r.status_code == 200
        models = r.json()
        assert len(models) > 5
        # find iPhone 13 -> code A2633
        m = next((x for x in models if x["name"] == "iPhone 13"), None)
        assert m is not None
        assert m.get("code") == "A2633"

    def test_create_brand_dedup_case_insensitive(self, client):
        r1 = client.post(f"{API}/catalog/brands", json={"name": "TEST_MarcaX"})
        assert r1.status_code == 200
        b1 = r1.json()
        r2 = client.post(f"{API}/catalog/brands", json={"name": "test_marcax"})
        assert r2.status_code == 200
        assert r2.json()["id"] == b1["id"]
        # cleanup
        client.delete(f"{API}/catalog/brands/{b1['id']}")

    def test_create_model_with_code_and_delete(self, client):
        b = client.post(f"{API}/catalog/brands", json={"name": "TEST_MarcaY"}).json()
        m = client.post(f"{API}/catalog/models", json={
            "brand": "TEST_MarcaY", "name": "TEST_ModY", "code": "X-123", "device_type": "smartphone"
        })
        assert m.status_code == 200
        md = m.json()
        assert md["name"] == "TEST_ModY"
        assert md["code"] == "X-123"
        # dedup case-insensitive
        m2 = client.post(f"{API}/catalog/models", json={"brand": "TEST_MarcaY", "name": "test_mody"})
        assert m2.status_code == 200
        assert m2.json()["id"] == md["id"]
        # list filtered
        lst = client.get(f"{API}/catalog/models", params={"brand": "TEST_MarcaY"}).json()
        assert any(x["id"] == md["id"] for x in lst)
        # delete
        assert client.delete(f"{API}/catalog/models/{md['id']}").status_code == 200
        # delete brand cascades models (safe)
        assert client.delete(f"{API}/catalog/brands/{b['id']}").status_code == 200


class TestDeviceHistory:
    def test_short_serial_empty(self, client):
        r = client.get(f"{API}/devices/history", params={"serial": "abc"})
        assert r.status_code == 200
        assert r.json() == {"repairs": [], "refurbished": []}

    def test_history_finds_repair_case_insensitive_and_exclude_id(self, client):
        # create a customer
        cust = client.post(f"{API}/customers", json={"name": "TEST_HistCust"}).json()
        # create a repair with a unique serial
        serial = "TESTSER_ITER4_9911"
        rep = client.post(f"{API}/repairs", json={
            "customer_id": cust["id"], "customer_name": cust["name"],
            "device_type": "smartphone", "device_brand": "Apple", "device_model": "iPhone 13",
            "serial_or_imei": serial, "problem": "TEST", "status": "in_lavorazione",
        })
        assert rep.status_code == 200, rep.text
        rid = rep.json()["id"]
        try:
            # lookup case-insensitive
            r = client.get(f"{API}/devices/history", params={"serial": serial.lower()})
            data = r.json()
            assert any(x["id"] == rid for x in data["repairs"])
            # exclude_id removes it
            r2 = client.get(f"{API}/devices/history", params={"serial": serial, "exclude_id": rid})
            assert not any(x["id"] == rid for x in r2.json()["repairs"])
        finally:
            client.delete(f"{API}/repairs/{rid}")
            client.delete(f"{API}/customers/{cust['id']}")


class TestCashReference:
    def test_reference_404(self, client):
        r = client.get(f"{API}/cash/does-not-exist/reference")
        assert r.status_code == 404

    def test_reference_manual_movement(self, client):
        m = client.post(f"{API}/cash", json={"type": "entrata", "category": "altro",
                                             "description": "TEST_manual", "amount": 10.0})
        assert m.status_code == 200
        mid = m.json()["id"]
        try:
            r = client.get(f"{API}/cash/{mid}/reference")
            assert r.status_code == 200
            body = r.json()
            assert body["type"] is None
            assert body["data"] is None
        finally:
            client.delete(f"{API}/cash/{mid}")

    def test_reference_repair_and_sale_and_refurb(self, client):
        # Repair -> completed with final price generates cash entrata
        cust = client.post(f"{API}/customers", json={"name": "TEST_RefCust"}).json()
        rep = client.post(f"{API}/repairs", json={
            "customer_id": cust["id"], "customer_name": cust["name"],
            "device_type": "smartphone", "device_brand": "Apple", "device_model": "iPhone 13",
            "problem": "TEST", "status": "consegnata", "final_price": 50.0, "paid": True,
        }).json()
        # trigger cash movement via PUT (create doesn't run the payout logic)
        client.put(f"{API}/repairs/{rep['id']}", json={"status": "consegnata", "paid": True, "final_price": 50.0})
        cash = client.get(f"{API}/cash").json()
        rep_cash = next((m for m in cash if m.get("reference_id") == rep["id"]), None)
        assert rep_cash, "cash movement for repair not found"
        ref = client.get(f"{API}/cash/{rep_cash['id']}/reference").json()
        assert ref["type"] == "repair"
        assert ref["data"]["id"] == rep["id"]

        # Sale
        sale = client.post(f"{API}/sales", json={
            "customer_name": "TEST_RefCust", "items": [{"description": "TEST_it", "quantity": 1, "unit_price": 12.0}],
            "total": 12.0
        }).json()
        cash2 = client.get(f"{API}/cash").json()
        s_cash = next((m for m in cash2 if m.get("reference_id") == sale["id"]), None)
        assert s_cash
        ref_s = client.get(f"{API}/cash/{s_cash['id']}/reference").json()
        assert ref_s["type"] == "sale"

        # Refurbished
        ref_dev = client.post(f"{API}/refurbished", json={
            "device_type": "smartphone", "brand": "Apple", "model": "iPhone 13",
            "purchase_cost": 80.0, "color": "Nero", "grade": "A",
        }).json()
        cash3 = client.get(f"{API}/cash").json()
        d_cash = next((m for m in cash3 if m.get("reference_id") == ref_dev["id"]), None)
        assert d_cash
        ref_d = client.get(f"{API}/cash/{d_cash['id']}/reference").json()
        assert ref_d["type"] == "refurbished"

        # cleanup
        client.delete(f"{API}/refurbished/{ref_dev['id']}")
        client.delete(f"{API}/sales/{sale['id']}")
        client.delete(f"{API}/repairs/{rep['id']}")
        client.delete(f"{API}/customers/{cust['id']}")


class TestRepairsDates:
    def test_put_repair_received_delivered(self, client):
        cust = client.post(f"{API}/customers", json={"name": "TEST_DateCust"}).json()
        rep = client.post(f"{API}/repairs", json={
            "customer_id": cust["id"], "customer_name": cust["name"],
            "device_type": "smartphone", "device_brand": "Apple", "device_model": "iPhone 13",
            "problem": "TEST", "status": "in_lavorazione",
        }).json()
        try:
            u = client.put(f"{API}/repairs/{rep['id']}", json={
                "received_at": "2025-11-01T00:00:00+00:00",
                "delivered_at": "2025-11-05T00:00:00+00:00",
            })
            assert u.status_code == 200
            got = client.get(f"{API}/repairs/{rep['id']}").json()
            assert got["received_at"].startswith("2025-11-01")
            assert got["delivered_at"].startswith("2025-11-05")
        finally:
            client.delete(f"{API}/repairs/{rep['id']}")
            client.delete(f"{API}/customers/{cust['id']}")


class TestPartsDates:
    def test_put_part_entered_exited(self, client):
        p = client.post(f"{API}/parts", json={"name": "TEST_PartDate", "quantity": 3,
                                               "cost_price": 1.0, "sell_price": 2.0}).json()
        try:
            u = client.put(f"{API}/parts/{p['id']}", json={
                "name": "TEST_PartDate", "quantity": 3, "cost_price": 1.0, "sell_price": 2.0,
                "entered_at": "2025-10-01T00:00:00+00:00",
                "exited_at": "2025-10-15T00:00:00+00:00",
            })
            assert u.status_code == 200
            got = client.get(f"{API}/parts/{p['id']}").json()
            assert got["entered_at"].startswith("2025-10-01")
            assert got["exited_at"].startswith("2025-10-15")
        finally:
            client.delete(f"{API}/parts/{p['id']}")


class TestRefurbishedColorGrade:
    def test_create_with_color_and_grade(self, client):
        r = client.post(f"{API}/refurbished", json={
            "device_type": "smartphone", "brand": "Apple", "model": "iPhone 13",
            "purchase_cost": 100.0, "color": "Blu Pacifico", "grade": "A+",
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["color"] == "Blu Pacifico"
        assert d["grade"] == "A+"
        # verify by GET
        g = client.get(f"{API}/refurbished/{d['id']}").json()
        assert g["color"] == "Blu Pacifico"
        assert g["grade"] == "A+"
        client.delete(f"{API}/refurbished/{d['id']}")
