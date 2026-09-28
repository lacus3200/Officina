from conftest import API, cash_for


def _refurb_with_repair_and_sale(client, temp_part):
    part = temp_part(name="TEST_i14_part", quantity=5, cost_price=10.0, sell_price=20.0)
    d = client.post(f"{API}/refurbished", json={"device_type": "Smartphone", "brand": "TESTB", "model": "TESTM", "purchase_cost": 100.0}).json()
    rep = client.post(f"{API}/refurbished/{d['id']}/open-repair", json={"problem": "test"}).json()["repair"]
    client.put(f"{API}/repairs/{rep['id']}", json={"parts_used": [{"part_id": part["id"], "part_name": part["name"], "quantity": 2, "unit_price": 20.0}]})
    client.post(f"{API}/refurbished/{d['id']}/costs", json={"description": "pulizia", "amount": 5.0})
    sold = client.post(f"{API}/refurbished/{d['id']}/sell", json={"sale_price": 300.0}).json()
    assert client.get(f"{API}/parts/{part['id']}").json()["quantity"] == 3
    return part, d, rep, sold


class TestRefurbDeleteOptions:
    def test_keep_everything(self, client, temp_part):
        part, d, rep, sold = _refurb_with_repair_and_sale(client, temp_part)
        r = client.delete(f"{API}/refurbished/{d['id']}", params={"cancel_cash": False, "delete_repair": False, "delete_sale": False})
        assert r.status_code == 200 and r.json()["warnings"] == []
        assert client.get(f"{API}/repairs/{rep['id']}").status_code == 200
        assert client.get(f"{API}/sales/{sold['sale_id']}").status_code == 200
        # purchase movement kept as manual
        movs = [m for m in client.get(f"{API}/cash").json() if (m.get("description") or "").startswith(f"Acquisto dispositivo {d['code']}")]
        assert len(movs) == 1 and movs[0]["reference_id"] is None
        assert client.get(f"{API}/parts/{part['id']}").json()["quantity"] == 3
        client.delete(f"{API}/sales/{sold['sale_id']}")
        client.delete(f"{API}/repairs/{rep['id']}", params={"restore_parts": False})
        client.delete(f"{API}/cash/{movs[0]['id']}")

    def test_delete_all_and_restore(self, client, temp_part):
        part, d, rep, sold = _refurb_with_repair_and_sale(client, temp_part)
        r = client.delete(f"{API}/refurbished/{d['id']}", params={"cancel_cash": True, "delete_repair": True, "delete_sale": True, "restore_parts": True})
        assert r.status_code == 200
        assert client.get(f"{API}/repairs/{rep['id']}").status_code == 404
        assert client.get(f"{API}/sales/{sold['sale_id']}").status_code == 404
        assert cash_for(client, d["id"]) == [] and cash_for(client, sold["sale_id"]) == []
        assert client.get(f"{API}/parts/{part['id']}").json()["quantity"] == 5


class TestIntegrity:
    def test_check_and_repair(self, client, temp_part):
        part, d, rep, sold = _refurb_with_repair_and_sale(client, temp_part)
        # break: change purchase cost movement directly is impossible via API -> use refurb sale mismatch by editing sale total
        # Create orphan cash by deleting a sale movement source: create a manual movement referencing a fake id
        mov = client.post(f"{API}/cash", json={"type": "uscita", "category": "acquisto_ricambi", "amount": 3.0, "description": "TEST orphan", "reference_id": "does-not-exist"}).json()
        res = client.get(f"{API}/integrity/check").json()
        kinds = {i["kind"]: i for i in res["issues"]}
        assert "cash_orphan" in kinds
        assert res["fixable"] >= 1
        rep_res = client.post(f"{API}/integrity/repair", json={"issue_ids": [kinds["cash_orphan"]["id"]]}).json()
        assert rep_res["fixed"] >= 1
        after = client.get(f"{API}/cash").json()
        m = next(x for x in after if x["id"] == mov["id"])
        assert m["reference_id"] is None
        client.delete(f"{API}/cash/{mov['id']}")
        client.delete(f"{API}/refurbished/{d['id']}", params={"delete_sale": True, "restore_parts": True})

    def test_purchase_date_change_syncs_cash(self, client):
        d = client.post(f"{API}/refurbished", json={"device_type": "Smartphone", "purchase_cost": 50.0, "purchase_date": "2026-01-01T00:00:00Z"}).json()
        r = client.put(f"{API}/refurbished/{d['id']}", json={"purchase_date": "2026-03-03T00:00:00Z", "purchase_cost": 60.0})
        assert r.status_code == 200 and r.json()["warnings"] == []
        movs = cash_for(client, d["id"], "acquisto")
        assert len(movs) == 1 and movs[0]["date"].startswith("2026-03-03") and abs(movs[0]["amount"] - 60.0) < 0.01
        assert client.get(f"{API}/integrity/check").json()["count"] == 0 or all(i["reference_id"] != d["id"] for i in client.get(f"{API}/integrity/check").json()["issues"])
        client.delete(f"{API}/refurbished/{d['id']}")
