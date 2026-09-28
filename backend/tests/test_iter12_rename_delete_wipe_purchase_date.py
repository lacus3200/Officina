"""Iter12: catalog rename/delete propagation, part-categories/brands, backup wipe, refurb purchase_date -> cash date."""
import pytest
from tests.conftest import API


# ---------- Brand rename/delete propagation ----------
def test_rename_brand_propagates_all(client):
    b = client.post(f"{API}/catalog/brands", json={"name": "TESTBrandX"}).json()
    m = client.post(f"{API}/catalog/models", json={"brand": "TESTBrandX", "name": "TESTModelZ", "device_type": "Smartphone"}).json()
    rep = client.post(f"{API}/repairs", json={
        "device_type": "Smartphone", "device_brand": "TESTBrandX", "device_model": "TESTModelZ", "problem": "p",
    }).json()
    ref = client.post(f"{API}/refurbished", json={
        "device_type": "Smartphone", "device_brand": "TESTBrandX", "device_model": "TESTModelZ", "brand": "TESTBrandX", "model": "TESTModelZ",
        "purchase_cost": 5.0,
    }).json()
    part = client.post(f"{API}/parts", json={
        "name": "TEST_compat_p", "quantity": 1, "min_quantity": 0, "cost_price": 0.0, "sell_price": 0.0,
        "compatible_models": ["TESTBrandX TESTModelZ"],
    }).json()
    try:
        r = client.put(f"{API}/catalog/brands/{b['id']}", json={"name": "TESTBrandY"})
        assert r.status_code == 200 and r.json()["name"] == "TESTBrandY"
        # propagation
        assert any(x["brand"] == "TESTBrandY" for x in client.get(f"{API}/catalog/models").json())
        assert client.get(f"{API}/repairs/{rep['id']}").json()["device_brand"] == "TESTBrandY"
        assert client.get(f"{API}/refurbished/{ref['id']}").json()["brand"] == "TESTBrandY"
        assert "TESTBrandY TESTModelZ" in client.get(f"{API}/parts/{part['id']}").json()["compatible_models"]
    finally:
        client.delete(f"{API}/parts/{part['id']}")
        client.delete(f"{API}/refurbished/{ref['id']}")
        client.delete(f"{API}/repairs/{rep['id']}")
        client.delete(f"{API}/catalog/models/{m['id']}")
        client.delete(f"{API}/catalog/brands/{b['id']}")


def test_rename_brand_404_and_400(client):
    r = client.put(f"{API}/catalog/brands/nope-id-xyz", json={"name": "X"})
    assert r.status_code == 404
    b = client.post(f"{API}/catalog/brands", json={"name": "TESTBrand400"}).json()
    try:
        r = client.put(f"{API}/catalog/brands/{b['id']}", json={"name": "   "})
        assert r.status_code == 400
    finally:
        client.delete(f"{API}/catalog/brands/{b['id']}")


# ---------- Model rename propagation ----------
def test_rename_model_propagates(client):
    b = client.post(f"{API}/catalog/brands", json={"name": "TESTBrandM"}).json()
    m = client.post(f"{API}/catalog/models", json={"brand": "TESTBrandM", "name": "TESTModelA", "device_type": "Smartphone"}).json()
    rep = client.post(f"{API}/repairs", json={
        "device_type": "Smartphone", "device_brand": "TESTBrandM", "device_model": "TESTModelA", "problem": "p",
    }).json()
    ref = client.post(f"{API}/refurbished", json={
        "device_type": "Smartphone", "device_brand": "TESTBrandM", "device_model": "TESTModelA",
        "brand": "TESTBrandM", "model": "TESTModelA", "purchase_cost": 1.0,
    }).json()
    part = client.post(f"{API}/parts", json={
        "name": "TEST_compat_m", "quantity": 1, "min_quantity": 0, "cost_price": 0, "sell_price": 0,
        "compatible_models": ["TESTBrandM TESTModelA"],
    }).json()
    try:
        r = client.put(f"{API}/catalog/models/{m['id']}", json={"brand": "TESTBrandM", "name": "TESTModelB", "device_type": "Smartphone"})
        assert r.status_code == 200 and r.json()["name"] == "TESTModelB"
        assert client.get(f"{API}/repairs/{rep['id']}").json()["device_model"] == "TESTModelB"
        assert client.get(f"{API}/refurbished/{ref['id']}").json()["model"] == "TESTModelB"
        assert "TESTBrandM TESTModelB" in client.get(f"{API}/parts/{part['id']}").json()["compatible_models"]
    finally:
        client.delete(f"{API}/parts/{part['id']}")
        client.delete(f"{API}/refurbished/{ref['id']}")
        client.delete(f"{API}/repairs/{rep['id']}")
        client.delete(f"{API}/catalog/models/{m['id']}")
        client.delete(f"{API}/catalog/brands/{b['id']}")


# ---------- Color rename/delete propagation on refurbished ----------
def test_color_rename_and_delete_propagates_refurb(client):
    b = client.post(f"{API}/catalog/brands", json={"name": "TESTColBr"}).json()
    m = client.post(f"{API}/catalog/models", json={"brand": "TESTColBr", "name": "TESTColMd", "device_type": "Smartphone"}).json()
    client.post(f"{API}/catalog/models/{m['id']}/colors", json={"color": "Rosso"})
    ref = client.post(f"{API}/refurbished", json={
        "device_type": "Smartphone", "device_brand": "TESTColBr", "device_model": "TESTColMd",
        "brand": "TESTColBr", "model": "TESTColMd", "color": "Rosso", "purchase_cost": 1.0,
    }).json()
    try:
        r = client.put(f"{API}/catalog/models/{m['id']}/colors", json={"old": "Rosso", "new": "Cremisi"})
        assert r.status_code == 200
        assert client.get(f"{API}/refurbished/{ref['id']}").json()["color"] == "Cremisi"
        # delete color
        r = client.put(f"{API}/catalog/models/{m['id']}/colors", json={"old": "Cremisi", "new": None})
        assert r.status_code == 200
        assert client.get(f"{API}/refurbished/{ref['id']}").json()["color"] in (None, "")
    finally:
        client.delete(f"{API}/refurbished/{ref['id']}")
        client.delete(f"{API}/catalog/models/{m['id']}")
        client.delete(f"{API}/catalog/brands/{b['id']}")


# ---------- Part categories delete/rename ----------
def test_delete_part_category_nulls_parts(client):
    p = client.post(f"{API}/parts", json={
        "name": "TEST_cat_p", "category": "TESTCatX", "quantity": 0, "min_quantity": 0, "cost_price": 0, "sell_price": 0,
    }).json()
    try:
        r = client.put(f"{API}/catalog/part-categories/delete", json={"name": "TESTCatX"})
        assert r.status_code == 200
        assert client.get(f"{API}/parts/{p['id']}").json().get("category") in (None, "")
    finally:
        client.delete(f"{API}/parts/{p['id']}")


def test_rename_part_category_updates_parts(client):
    p = client.post(f"{API}/parts", json={
        "name": "TEST_cat_ren", "category": "TESTCatR1", "quantity": 0, "min_quantity": 0, "cost_price": 0, "sell_price": 0,
    }).json()
    try:
        r = client.put(f"{API}/catalog/part-categories/rename", json={"old": "TESTCatR1", "new": "TESTCatR2"})
        assert r.status_code == 200
        assert client.get(f"{API}/parts/{p['id']}").json()["category"] == "TESTCatR2"
    finally:
        client.delete(f"{API}/parts/{p['id']}")


# ---------- Part brands rename (empty -> null) ----------
def test_rename_part_brand_and_clear(client):
    p = client.post(f"{API}/parts", json={
        "name": "TEST_pb", "brand": "TESTPBrandX", "quantity": 0, "min_quantity": 0, "cost_price": 0, "sell_price": 0,
    }).json()
    try:
        r = client.put(f"{API}/catalog/part-brands/rename", json={"old": "TESTPBrandX", "new": "TESTPBrandY"})
        assert r.status_code == 200 and r.json()["parts"] >= 1
        assert client.get(f"{API}/parts/{p['id']}").json()["brand"] == "TESTPBrandY"
        # clear with empty
        r = client.put(f"{API}/catalog/part-brands/rename", json={"old": "TESTPBrandY", "new": ""})
        assert r.status_code == 200
        assert client.get(f"{API}/parts/{p['id']}").json()["brand"] in (None, "")
    finally:
        client.delete(f"{API}/parts/{p['id']}")


# ---------- Refurbished purchase_date -> cash movement date ----------
def test_refurb_purchase_date_sets_cash_date(client):
    ref = client.post(f"{API}/refurbished", json={
        "device_type": "Smartphone", "device_brand": "TESTPD", "device_model": "TESTPD1",
        "brand": "TESTPD", "model": "TESTPD1",
        "purchase_cost": 50.0, "purchase_date": "2026-01-05T12:00:00",
    }).json()
    try:
        movs = [m for m in client.get(f"{API}/cash").json() if m.get("reference_id") == ref["id"]]
        assert movs, "expected cash movement for refurb purchase"
        assert movs[0]["date"].startswith("2026-01-05"), movs[0]
        assert movs[0]["type"] == "uscita"
        assert "RIC" in movs[0].get("description", "") or "icondizion" in movs[0].get("description", "").lower() or movs[0]["category"] in ("acquisto_ricondizionato", "acquisto_dispositivo")
    finally:
        client.delete(f"{API}/refurbished/{ref['id']}")


# ---------- Backup wipe: 400 on wrong confirm, correct behavior on ELIMINA (dry) ----------
def test_wipe_wrong_confirm_400(client):
    r = client.post(f"{API}/backup/wipe", json={"confirm": "no", "include_catalogs": False})
    assert r.status_code == 400


def test_wipe_roundtrip_via_export_import_replace(client):
    """Safety: export -> wipe (operational only) -> import replace -> counts restored."""
    # snapshot counts
    def _counts():
        return {
            "customers": len(client.get(f"{API}/customers").json()),
            "parts": len(client.get(f"{API}/parts").json()),
            "repairs": len(client.get(f"{API}/repairs").json()),
            "sales": len(client.get(f"{API}/sales").json()),
            "refurbished": len(client.get(f"{API}/refurbished").json()),
        }

    before = _counts()
    exp = client.get(f"{API}/backup/export").json()
    assert "collections" in exp
    try:
        r = client.post(f"{API}/backup/wipe", json={"confirm": "ELIMINA", "include_catalogs": False})
        assert r.status_code == 200
        after_wipe = _counts()
        assert after_wipe["customers"] == 0 and after_wipe["parts"] == 0
        # restore
        imp = client.post(f"{API}/backup/import", json={"mode": "replace", "collections": exp["collections"]})
        assert imp.status_code == 200, imp.text
    finally:
        # ensure restore even on failure
        client.post(f"{API}/backup/import", json={"mode": "replace", "collections": exp["collections"]})
    after = _counts()
    assert after == before, f"counts mismatch: before={before} after={after}"


# ---------- Services rename & delete (list & verify via GET) ----------
def test_service_rename_and_delete(client):
    s = client.post(f"{API}/services", json={"name": "TEST_Serv1", "category": "TESTSvc", "price": 10.0}).json()
    try:
        r = client.put(f"{API}/services/{s['id']}", json={"name": "TEST_Serv2", "category": "TESTSvc", "price": 10.0})
        assert r.status_code == 200
        found = [x for x in client.get(f"{API}/services").json() if x["id"] == s["id"]]
        assert found and found[0]["name"] == "TEST_Serv2"
    finally:
        client.delete(f"{API}/services/{s['id']}")
    # verify deleted
    found = [x for x in client.get(f"{API}/services").json() if x["id"] == s["id"]]
    assert not found
