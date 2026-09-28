"""Iter7 backend tests: part-categories rename, part-brands, template update propagation,
part POST with brand, backup export/import merge & replace on small collection."""
from conftest import BASE_URL


# ---------- part-categories ----------
def test_list_part_categories(client):
    r = client.get(f"{BASE_URL}/api/catalog/part-categories")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    names = [c["name"] for c in data]
    assert "Schermo" in names
    for c in data:
        assert "name" in c and "parts" in c and isinstance(c["parts"], int)


def test_rename_part_category_empty_400(client):
    r = client.put(f"{BASE_URL}/api/catalog/part-categories/rename",
                   json={"old": "Schermo", "new": "  "})
    assert r.status_code == 400


def test_rename_part_category_roundtrip(client):
    # create a template & part with unique category
    old = "TEST_CatX"
    new = "TEST_CatY"
    tpl = client.post(f"{BASE_URL}/api/catalog/parts",
                      json={"name": "TEST_pezzoA", "category": old}).json()
    part = client.post(f"{BASE_URL}/api/parts",
                       json={"name": "TEST_pezzoA", "category": old, "quantity": 1}).json()
    try:
        r = client.put(f"{BASE_URL}/api/catalog/part-categories/rename",
                       json={"old": old, "new": new})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["parts"] >= 1 and body["templates"] >= 1

        # verify persistence
        tpl2 = client.get(f"{BASE_URL}/api/catalog/parts").json()
        assert any(t["id"] == tpl["id"] and t["category"] == new for t in tpl2)
        p2 = client.get(f"{BASE_URL}/api/parts/{part['id']}").json()
        assert p2["category"] == new
    finally:
        client.delete(f"{BASE_URL}/api/catalog/parts/{tpl['id']}")
        client.delete(f"{BASE_URL}/api/parts/{part['id']}")


# ---------- part-brands ----------
def test_list_part_brands(client):
    r = client.get(f"{BASE_URL}/api/catalog/part-brands")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    # base set present
    for b in ["Apple", "Samsung", "BOE"]:
        assert b in data


# ---------- PUT /catalog/parts/{id} propagation ----------
def test_update_template_propagates_name_to_parts(client):
    tpl = client.post(f"{BASE_URL}/api/catalog/parts",
                      json={"name": "TEST_OldName", "category": "Batteria"}).json()
    part = client.post(f"{BASE_URL}/api/parts",
                       json={"name": "TEST_OldName", "quantity": 1}).json()
    try:
        r = client.put(f"{BASE_URL}/api/catalog/parts/{tpl['id']}",
                       json={"name": "TEST_NewName", "category": "Batteria"})
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_NewName"
        # part should have new name
        p2 = client.get(f"{BASE_URL}/api/parts/{part['id']}").json()
        assert p2["name"] == "TEST_NewName"
    finally:
        client.delete(f"{BASE_URL}/api/catalog/parts/{tpl['id']}")
        client.delete(f"{BASE_URL}/api/parts/{part['id']}")


def test_update_template_404(client):
    r = client.put(f"{BASE_URL}/api/catalog/parts/nonexistent-id-xyz",
                   json={"name": "x", "category": "y"})
    assert r.status_code == 404


# ---------- POST /parts brand persists ----------
def test_create_part_with_brand(client):
    r = client.post(f"{BASE_URL}/api/parts", json={
        "name": "TEST_Schermo BOE",
        "brand": "BOE",
        "category": "Schermo",
        "quantity": 2,
        "compatible_models": ["Apple iPhone 13"],
    })
    assert r.status_code == 200
    p = r.json()
    assert p["brand"] == "BOE"
    assert p["category"] == "Schermo"
    g = client.get(f"{BASE_URL}/api/parts/{p['id']}").json()
    assert g["brand"] == "BOE"
    client.delete(f"{BASE_URL}/api/parts/{p['id']}")


# ---------- Backup ----------
def test_backup_export_shape(client):
    r = client.get(f"{BASE_URL}/api/backup/export")
    assert r.status_code == 200
    data = r.json()
    assert data.get("version") == 1
    assert "exported_at" in data
    cols = data.get("collections", {})
    for name in ["customers", "parts", "repairs", "sales", "cash_movements",
                 "refurbished", "device_brands", "device_models", "services",
                 "part_templates", "counters"]:
        assert name in cols, f"missing collection {name}"
        assert isinstance(cols[name], list)
    # no mongo _id in cleaned docs (parts)
    if cols["parts"]:
        assert "_id" not in cols["parts"][0]


def test_backup_import_unknown_collection_400(client):
    r = client.post(f"{BASE_URL}/api/backup/import",
                    json={"collections": {"foo_bar": []}, "mode": "merge"})
    assert r.status_code == 400


def test_backup_import_merge_services_idempotent(client):
    # snapshot services
    services_before = client.get(f"{BASE_URL}/api/services").json()
    payload = {"collections": {"services": services_before}, "mode": "merge"}
    r = client.post(f"{BASE_URL}/api/backup/import", json=payload)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["mode"] == "merge"
    assert body["imported"]["services"] == len(services_before)
    # confirm same count after
    services_after = client.get(f"{BASE_URL}/api/services").json()
    assert len(services_after) == len(services_before)


def test_backup_import_replace_services_small(client):
    # snapshot services (only this small collection to keep test safe)
    services_before = client.get(f"{BASE_URL}/api/services").json()
    payload = {"collections": {"services": services_before}, "mode": "replace"}
    r = client.post(f"{BASE_URL}/api/backup/import", json=payload)
    assert r.status_code == 200, r.text
    services_after = client.get(f"{BASE_URL}/api/services").json()
    assert len(services_after) == len(services_before)
