"""Iteration 15 tests:
- Part.color persistence
- Part status transitions esaurito <-> disponibile (POST parts, PUT part qty, PUT repair parts_used)
- Refurbished services_cost / total_cost including linked open-repair services + parts
- Sale cost_total = refurb total_cost after sell
- GET /api/customers/{id}/summary payload
"""
import pytest


# --------- helpers -----------------------------------------------------------

def _mk_customer(client, api_url, name):
    r = client.post(f"{api_url}/customers", json={"name": name})
    assert r.status_code == 200, r.text
    return r.json()


def _cleanup_customer(client, api_url, cid):
    client.delete(f"{api_url}/customers/{cid}")


# --------- Part color + status esaurito -------------------------------------

class TestPartColorAndStatus:
    def test_create_part_with_color(self, client, api_url):
        r = client.post(f"{api_url}/parts", json={
            "name": "TEST_Color_Rosso", "quantity": 2, "cost_price": 1.0, "sell_price": 5.0, "color": "Rosso",
        })
        assert r.status_code == 200, r.text
        p = r.json()
        assert p.get("color") == "Rosso"
        assert p.get("quantity") == 2
        assert p.get("status") == "disponibile"

        # PUT qty 0 -> esaurito
        r2 = client.put(f"{api_url}/parts/{p['id']}", json={
            "name": p["name"], "quantity": 0, "status": "disponibile", "cost_price": 1.0, "sell_price": 5.0, "color": "Rosso",
        })
        assert r2.status_code == 200, r2.text
        got = client.get(f"{api_url}/parts/{p['id']}").json()
        assert got["status"] == "esaurito"
        assert got["quantity"] == 0

        # PUT qty back to 3 -> disponibile
        r3 = client.put(f"{api_url}/parts/{p['id']}", json={
            "name": p["name"], "quantity": 3, "cost_price": 1.0, "sell_price": 5.0, "color": "Rosso",
        })
        assert r3.status_code == 200, r3.text
        got2 = client.get(f"{api_url}/parts/{p['id']}").json()
        assert got2["status"] == "disponibile"
        assert got2["quantity"] == 3

        client.delete(f"{api_url}/parts/{p['id']}")

    def test_repair_parts_used_flips_esaurito_and_back(self, client, api_url):
        # Create a part with qty=2
        part = client.post(f"{api_url}/parts", json={
            "name": "TEST_PartFlip", "quantity": 2, "cost_price": 1.0, "sell_price": 5.0, "color": "Blu",
        }).json()
        cust = _mk_customer(client, api_url, "TEST_Cust_Flip")

        # Create empty repair
        rep = client.post(f"{api_url}/repairs", json={
            "customer_id": cust["id"], "customer_name": cust["name"],
            "device_type": "smartphone", "problem": "TEST", "parts_used": [],
        }).json()

        # PUT repair with parts_used qty=2 -> part qty becomes 0, status esaurito
        r = client.put(f"{api_url}/repairs/{rep['id']}", json={
            "parts_used": [{"part_id": part["id"], "part_name": part["name"], "quantity": 2, "unit_price": 5.0}],
        })
        assert r.status_code == 200, r.text
        got = client.get(f"{api_url}/parts/{part['id']}").json()
        assert got["quantity"] == 0
        assert got["status"] == "esaurito"

        # Remove parts_used from repair -> restored back
        r2 = client.put(f"{api_url}/repairs/{rep['id']}", json={"parts_used": []})
        assert r2.status_code == 200, r2.text
        got2 = client.get(f"{api_url}/parts/{part['id']}").json()
        assert got2["quantity"] == 2
        assert got2["status"] == "disponibile"

        # cleanup
        client.delete(f"{api_url}/repairs/{rep['id']}")
        client.delete(f"{api_url}/parts/{part['id']}")
        _cleanup_customer(client, api_url, cust["id"])


# --------- Refurbished services_cost + total_cost + sale.cost_total ---------

class TestRefurbServicesCost:
    def test_services_cost_flow(self, client, api_url):
        # Create part qty=5 cost=10
        part = client.post(f"{api_url}/parts", json={
            "name": "TEST_RefurbPart", "quantity": 5, "cost_price": 10.0, "sell_price": 20.0,
        }).json()

        # Create refurb purchase_cost=100
        refurb = client.post(f"{api_url}/refurbished", json={
            "device_type": "smartphone", "brand": "TEST", "model": "SVC_COST",
            "purchase_cost": 100.0,
        }).json()

        # Open repair
        r = client.post(f"{api_url}/refurbished/{refurb['id']}/open-repair", json={"problem": "TEST svc"})
        assert r.status_code == 200, r.text
        repair_id = r.json()["repair"]["id"]

        # PUT repair with services + parts_used qty=2
        rp = client.put(f"{api_url}/repairs/{repair_id}", json={
            "services": [{"name": "Pulizia", "price": 30.0}],
            "parts_used": [{"part_id": part["id"], "part_name": part["name"], "quantity": 2, "unit_price": 10.0}],
        })
        assert rp.status_code == 200, rp.text

        # GET refurb: services_cost=30, total_cost = 100 + 20 (parts 2*10) + 30 = 150
        ref = client.get(f"{api_url}/refurbished/{refurb['id']}").json()
        assert ref["services_cost"] == 30.0, ref
        assert ref["total_cost"] == 150.0, ref

        # Sell -> cost_total on sale = 150
        cust = _mk_customer(client, api_url, "TEST_Cust_Svc")
        s = client.post(f"{api_url}/refurbished/{refurb['id']}/sell", json={
            "sale_price": 300.0, "customer_id": cust["id"], "customer_name": cust["name"], "payment_method": "contanti",
        })
        assert s.status_code == 200, s.text
        sold = s.json()
        assert sold["status"] == "venduto"
        sale_id = sold["sale_id"]

        sale = client.get(f"{api_url}/sales/{sale_id}").json()
        assert sale["cost_total"] == 150.0, sale
        assert sale["margin"] == 150.0, sale

        # cleanup
        client.delete(f"{api_url}/sales/{sale_id}")
        client.delete(f"{api_url}/refurbished/{refurb['id']}")
        client.delete(f"{api_url}/repairs/{repair_id}")
        client.delete(f"{api_url}/parts/{part['id']}")
        _cleanup_customer(client, api_url, cust["id"])


# --------- Customer summary --------------------------------------------------

class TestCustomerSummary:
    def test_summary_payload(self, client, api_url):
        cust = _mk_customer(client, api_url, "TEST_Cust_Summary")

        # Create 2 repairs - one open, one delivered+paid
        r1 = client.post(f"{api_url}/repairs", json={
            "customer_id": cust["id"], "customer_name": cust["name"],
            "device_type": "smartphone", "problem": "open one", "status": "in_lavorazione",
        }).json()
        r2 = client.post(f"{api_url}/repairs", json={
            "customer_id": cust["id"], "customer_name": cust["name"],
            "device_type": "smartphone", "problem": "closed one",
        }).json()
        client.put(f"{api_url}/repairs/{r2['id']}", json={
            "status": "consegnata", "final_price": 80.0, "paid": True,
        })

        s = client.get(f"{api_url}/customers/{cust['id']}/summary")
        assert s.status_code == 200, s.text
        summary = s.json()
        assert summary["repairs_total"] == 2
        assert summary["repairs_open"] >= 1
        assert summary["repairs_spent"] == 80.0
        assert isinstance(summary["repairs"], list) and len(summary["repairs"]) == 2
        # each repair entry has required fields
        for entry in summary["repairs"]:
            assert "id" in entry and "ticket_number" in entry and "status" in entry
        assert "sales" in summary and isinstance(summary["sales"], list)
        assert "sales_spent" in summary

        # cleanup
        client.delete(f"{api_url}/repairs/{r1['id']}")
        client.delete(f"{api_url}/repairs/{r2['id']}")
        _cleanup_customer(client, api_url, cust["id"])
