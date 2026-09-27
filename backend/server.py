from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

import bcrypt
import jwt
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, Query
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, ConfigDict


# ---------- DB ----------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# ---------- App ----------
app = FastAPI(title="Laboratorio Elettronica API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ---------- Auth utilities ----------
JWT_ALGORITHM = "HS256"


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(hours=12),
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Non autenticato")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Token non valido")
        user = await db.users.find_one({"id": payload["sub"]})
        if not user:
            raise HTTPException(status_code=401, detail="Utente non trovato")
        user.pop("_id", None)
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token scaduto")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token non valido")


# ---------- Models ----------
def new_id() -> str:
    return str(uuid.uuid4())


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class LoginRequest(BaseModel):
    email: str
    password: str


class Customer(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)


class CustomerIn(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None


PartCondition = Literal["nuovo", "usato", "ricondizionato"]
PartStatus = Literal["disponibile", "in_uso", "esaurito", "difettoso"]


class Part(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    name: str
    category: Optional[str] = None
    sku: Optional[str] = None
    serial_number: Optional[str] = None
    condition: PartCondition = "nuovo"
    status: PartStatus = "disponibile"
    quantity: int = 0
    min_quantity: int = 0
    cost_price: float = 0.0
    sell_price: float = 0.0
    location: Optional[str] = None
    notes: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


class PartIn(BaseModel):
    name: str
    category: Optional[str] = None
    sku: Optional[str] = None
    serial_number: Optional[str] = None
    condition: PartCondition = "nuovo"
    status: PartStatus = "disponibile"
    quantity: int = 0
    min_quantity: int = 0
    cost_price: float = 0.0
    sell_price: float = 0.0
    location: Optional[str] = None
    notes: Optional[str] = None


RepairStatus = Literal["in_attesa", "in_lavorazione", "completata", "consegnata", "annullata"]


class RepairPartUsed(BaseModel):
    part_id: str
    part_name: str
    quantity: int = 1
    unit_price: float = 0.0


class Repair(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    ticket_number: str
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    device_type: str  # pc, smartphone, tablet, altro
    device_brand: Optional[str] = None
    device_model: Optional[str] = None
    serial_or_imei: Optional[str] = None
    problem: str
    diagnosis: Optional[str] = None
    status: RepairStatus = "in_attesa"
    estimate: float = 0.0
    parts_used: List[RepairPartUsed] = []
    labor_cost: float = 0.0
    final_price: float = 0.0
    paid: bool = False
    technical_notes: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)
    delivered_at: Optional[str] = None


class RepairIn(BaseModel):
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    device_type: str
    device_brand: Optional[str] = None
    device_model: Optional[str] = None
    serial_or_imei: Optional[str] = None
    problem: str
    diagnosis: Optional[str] = None
    status: RepairStatus = "in_attesa"
    estimate: float = 0.0
    parts_used: List[RepairPartUsed] = []
    labor_cost: float = 0.0
    final_price: float = 0.0
    paid: bool = False
    technical_notes: Optional[str] = None


class RepairUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    device_type: Optional[str] = None
    device_brand: Optional[str] = None
    device_model: Optional[str] = None
    serial_or_imei: Optional[str] = None
    problem: Optional[str] = None
    diagnosis: Optional[str] = None
    status: Optional[RepairStatus] = None
    estimate: Optional[float] = None
    parts_used: Optional[List[RepairPartUsed]] = None
    labor_cost: Optional[float] = None
    final_price: Optional[float] = None
    paid: Optional[bool] = None
    technical_notes: Optional[str] = None


class SaleItem(BaseModel):
    part_id: Optional[str] = None
    description: str
    quantity: int = 1
    unit_price: float = 0.0


class Sale(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    invoice_number: str
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    items: List[SaleItem] = []
    total: float = 0.0
    cost_total: float = 0.0
    margin: float = 0.0
    payment_method: str = "contanti"
    notes: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)


class SaleIn(BaseModel):
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    items: List[SaleItem] = []
    total: float = 0.0
    cost_total: float = 0.0
    payment_method: str = "contanti"
    notes: Optional[str] = None


class CashMovement(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    type: Literal["entrata", "uscita"]
    category: str  # riparazione, vendita, spesa, altro
    amount: float
    description: Optional[str] = None
    reference_id: Optional[str] = None  # id riparazione o vendita
    date: str = Field(default_factory=now_iso)


class CashMovementIn(BaseModel):
    type: Literal["entrata", "uscita"]
    category: str
    amount: float
    description: Optional[str] = None
    reference_id: Optional[str] = None
    date: Optional[str] = None


class Supplier(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    name: str
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    vat_number: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)


class SupplierIn(BaseModel):
    name: str
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    vat_number: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None


OrderStatus = Literal["bozza", "ordinato", "parziale", "ricevuto", "annullato"]


class OrderItem(BaseModel):
    part_id: Optional[str] = None
    description: str
    quantity: int = 1
    unit_cost: float = 0.0
    received_qty: int = 0


class PurchaseOrder(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    order_number: str
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    items: List[OrderItem] = []
    status: OrderStatus = "ordinato"
    total: float = 0.0
    expected_date: Optional[str] = None
    tracking_code: Optional[str] = None
    notes: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)
    received_at: Optional[str] = None


class PurchaseOrderIn(BaseModel):
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    items: List[OrderItem] = []
    status: OrderStatus = "ordinato"
    expected_date: Optional[str] = None
    tracking_code: Optional[str] = None
    notes: Optional[str] = None


class PurchaseOrderUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    items: Optional[List[OrderItem]] = None
    status: Optional[OrderStatus] = None
    expected_date: Optional[str] = None
    tracking_code: Optional[str] = None
    notes: Optional[str] = None


class ReceiveItem(BaseModel):
    index: int
    quantity: int


class ReceiveIn(BaseModel):
    items: List[ReceiveItem]


RefurbStatus = Literal["acquistato", "in_ricondizionamento", "pronto", "venduto"]


class RefurbCost(BaseModel):
    id: str = Field(default_factory=new_id)
    description: str
    amount: float = 0.0
    date: str = Field(default_factory=now_iso)


class Refurbished(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    code: str
    device_type: str
    brand: Optional[str] = None
    model: Optional[str] = None
    serial_or_imei: Optional[str] = None
    specs: Optional[str] = None
    purchase_cost: float = 0.0
    purchase_source: Optional[str] = None
    supplier_id: Optional[str] = None
    purchase_date: str = Field(default_factory=now_iso)
    target_price: float = 0.0
    status: RefurbStatus = "acquistato"
    repair_id: Optional[str] = None
    refurb_costs: List[RefurbCost] = []
    sale_id: Optional[str] = None
    sale_price: float = 0.0
    sold_at: Optional[str] = None
    notes: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


class RefurbishedIn(BaseModel):
    device_type: str
    brand: Optional[str] = None
    model: Optional[str] = None
    serial_or_imei: Optional[str] = None
    specs: Optional[str] = None
    purchase_cost: float = 0.0
    purchase_source: Optional[str] = None
    supplier_id: Optional[str] = None
    purchase_date: Optional[str] = None
    target_price: float = 0.0
    status: RefurbStatus = "acquistato"
    notes: Optional[str] = None


class RefurbishedUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    device_type: Optional[str] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    serial_or_imei: Optional[str] = None
    specs: Optional[str] = None
    purchase_cost: Optional[float] = None
    purchase_source: Optional[str] = None
    supplier_id: Optional[str] = None
    purchase_date: Optional[str] = None
    target_price: Optional[float] = None
    status: Optional[RefurbStatus] = None
    repair_id: Optional[str] = None
    notes: Optional[str] = None


class RefurbCostIn(BaseModel):
    description: str
    amount: float = 0.0


class RefurbSellIn(BaseModel):
    sale_price: float
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    payment_method: str = "contanti"
    notes: Optional[str] = None


# ---------- Auth endpoints ----------
def set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=60 * 60 * 12,
        path="/",
    )


@api.post("/auth/login")
async def login(body: LoginRequest, response: Response):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenziali non valide")
    token = create_access_token(user["id"], user["email"])
    set_auth_cookie(response, token)
    return {"id": user["id"], "email": user["email"], "name": user.get("name", "Admin"), "token": token}


@api.post("/auth/logout")
async def logout(response: Response, user: dict = Depends(get_current_user)):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


# ---------- Helpers ----------
def clean(doc: dict) -> dict:
    if doc is None:
        return doc
    doc.pop("_id", None)
    return doc


async def next_sequence(name: str) -> int:
    doc = await db.counters.find_one_and_update(
        {"_id": name},
        {"$inc": {"value": 1}},
        upsert=True,
        return_document=True,
    )
    return doc["value"]


# ---------- Customers ----------
@api.get("/customers")
async def list_customers(user: dict = Depends(get_current_user), q: Optional[str] = None):
    query = {}
    if q:
        query = {"$or": [
            {"name": {"$regex": q, "$options": "i"}},
            {"phone": {"$regex": q, "$options": "i"}},
            {"email": {"$regex": q, "$options": "i"}},
        ]}
    items = await db.customers.find(query).sort("created_at", -1).to_list(1000)
    return [clean(i) for i in items]


@api.post("/customers")
async def create_customer(body: CustomerIn, user: dict = Depends(get_current_user)):
    obj = Customer(**body.model_dump())
    await db.customers.insert_one(obj.model_dump())
    return obj


@api.get("/customers/{customer_id}")
async def get_customer(customer_id: str, user: dict = Depends(get_current_user)):
    c = await db.customers.find_one({"id": customer_id})
    if not c:
        raise HTTPException(404, "Cliente non trovato")
    return clean(c)


@api.put("/customers/{customer_id}")
async def update_customer(customer_id: str, body: CustomerIn, user: dict = Depends(get_current_user)):
    res = await db.customers.update_one({"id": customer_id}, {"$set": body.model_dump(exclude_unset=True)})
    if res.matched_count == 0:
        raise HTTPException(404, "Cliente non trovato")
    return clean(await db.customers.find_one({"id": customer_id}))


@api.delete("/customers/{customer_id}")
async def delete_customer(customer_id: str, user: dict = Depends(get_current_user)):
    await db.customers.delete_one({"id": customer_id})
    return {"ok": True}


# ---------- Parts / Inventory ----------
@api.get("/parts")
async def list_parts(user: dict = Depends(get_current_user), q: Optional[str] = None, low_stock: Optional[bool] = None):
    query = {}
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"sku": {"$regex": q, "$options": "i"}},
            {"serial_number": {"$regex": q, "$options": "i"}},
            {"category": {"$regex": q, "$options": "i"}},
        ]
    items = await db.parts.find(query).sort("created_at", -1).to_list(2000)
    items = [clean(i) for i in items]
    if low_stock:
        items = [p for p in items if p.get("quantity", 0) <= p.get("min_quantity", 0)]
    return items


@api.post("/parts")
async def create_part(body: PartIn, user: dict = Depends(get_current_user)):
    obj = Part(**body.model_dump())
    await db.parts.insert_one(obj.model_dump())
    return obj


@api.get("/parts/{part_id}")
async def get_part(part_id: str, user: dict = Depends(get_current_user)):
    p = await db.parts.find_one({"id": part_id})
    if not p:
        raise HTTPException(404, "Pezzo non trovato")
    return clean(p)


@api.put("/parts/{part_id}")
async def update_part(part_id: str, body: PartIn, user: dict = Depends(get_current_user)):
    data = body.model_dump(exclude_unset=True)
    data["updated_at"] = now_iso()
    res = await db.parts.update_one({"id": part_id}, {"$set": data})
    if res.matched_count == 0:
        raise HTTPException(404, "Pezzo non trovato")
    return clean(await db.parts.find_one({"id": part_id}))


@api.delete("/parts/{part_id}")
async def delete_part(part_id: str, user: dict = Depends(get_current_user)):
    await db.parts.delete_one({"id": part_id})
    return {"ok": True}


# ---------- Repairs ----------
@api.get("/repairs")
async def list_repairs(user: dict = Depends(get_current_user), status: Optional[str] = None, q: Optional[str] = None):
    query = {}
    if status:
        query["status"] = status
    if q:
        query["$or"] = [
            {"ticket_number": {"$regex": q, "$options": "i"}},
            {"customer_name": {"$regex": q, "$options": "i"}},
            {"device_brand": {"$regex": q, "$options": "i"}},
            {"device_model": {"$regex": q, "$options": "i"}},
            {"problem": {"$regex": q, "$options": "i"}},
        ]
    items = await db.repairs.find(query).sort("created_at", -1).to_list(2000)
    return [clean(i) for i in items]


@api.post("/repairs")
async def create_repair(body: RepairIn, user: dict = Depends(get_current_user)):
    seq = await next_sequence("repair")
    ticket = f"RIP-{seq:05d}"
    obj = Repair(ticket_number=ticket, **body.model_dump())
    await db.repairs.insert_one(obj.model_dump())
    return obj


@api.get("/repairs/{repair_id}")
async def get_repair(repair_id: str, user: dict = Depends(get_current_user)):
    r = await db.repairs.find_one({"id": repair_id})
    if not r:
        raise HTTPException(404, "Riparazione non trovata")
    return clean(r)


@api.put("/repairs/{repair_id}")
async def update_repair(repair_id: str, body: RepairUpdate, user: dict = Depends(get_current_user)):
    data = body.model_dump(exclude_unset=True)
    data["updated_at"] = now_iso()
    existing = await db.repairs.find_one({"id": repair_id})
    if not existing:
        raise HTTPException(404, "Riparazione non trovata")
    if data.get("status") == "consegnata" and not existing.get("delivered_at"):
        data["delivered_at"] = now_iso()
    await db.repairs.update_one({"id": repair_id}, {"$set": data})
    updated = clean(await db.repairs.find_one({"id": repair_id}))

    # Se consegnata e pagata registra la cassa (se non già presente)
    if updated.get("status") == "consegnata" and updated.get("paid"):
        exists = await db.cash_movements.find_one({"reference_id": repair_id, "category": "riparazione"})
        if not exists and updated.get("final_price", 0) > 0:
            mov = CashMovement(
                type="entrata",
                category="riparazione",
                amount=float(updated["final_price"]),
                description=f"Riparazione {updated['ticket_number']}",
                reference_id=repair_id,
            )
            await db.cash_movements.insert_one(mov.model_dump())
    return updated


@api.delete("/repairs/{repair_id}")
async def delete_repair(repair_id: str, user: dict = Depends(get_current_user)):
    await db.repairs.delete_one({"id": repair_id})
    await db.cash_movements.delete_many({"reference_id": repair_id})
    return {"ok": True}


# ---------- Sales ----------
@api.get("/sales")
async def list_sales(user: dict = Depends(get_current_user)):
    items = await db.sales.find({}).sort("created_at", -1).to_list(2000)
    return [clean(i) for i in items]


@api.post("/sales")
async def create_sale(body: SaleIn, user: dict = Depends(get_current_user)):
    seq = await next_sequence("sale")
    invoice = f"VEN-{seq:05d}"
    data = body.model_dump()
    total = sum(i["quantity"] * i["unit_price"] for i in data["items"])
    if not data.get("total"):
        data["total"] = round(total, 2)
    margin = round(data["total"] - data.get("cost_total", 0), 2)
    obj = Sale(invoice_number=invoice, margin=margin, **data)
    await db.sales.insert_one(obj.model_dump())

    # decrement stock for referenced parts
    for it in obj.items:
        if it.part_id:
            await db.parts.update_one({"id": it.part_id}, {"$inc": {"quantity": -it.quantity}})

    # cash entry
    mov = CashMovement(
        type="entrata",
        category="vendita",
        amount=obj.total,
        description=f"Vendita {obj.invoice_number}",
        reference_id=obj.id,
    )
    await db.cash_movements.insert_one(mov.model_dump())
    return obj


@api.get("/sales/{sale_id}")
async def get_sale(sale_id: str, user: dict = Depends(get_current_user)):
    s = await db.sales.find_one({"id": sale_id})
    if not s:
        raise HTTPException(404, "Vendita non trovata")
    return clean(s)


@api.delete("/sales/{sale_id}")
async def delete_sale(sale_id: str, user: dict = Depends(get_current_user)):
    await db.sales.delete_one({"id": sale_id})
    await db.cash_movements.delete_many({"reference_id": sale_id})
    return {"ok": True}


# ---------- Cash ----------
@api.get("/cash")
async def list_cash(user: dict = Depends(get_current_user), start: Optional[str] = None, end: Optional[str] = None):
    query = {}
    if start or end:
        query["date"] = {}
        if start:
            query["date"]["$gte"] = start
        if end:
            query["date"]["$lte"] = end
    items = await db.cash_movements.find(query).sort("date", -1).to_list(5000)
    return [clean(i) for i in items]


@api.post("/cash")
async def create_cash(body: CashMovementIn, user: dict = Depends(get_current_user)):
    data = body.model_dump()
    if not data.get("date"):
        data["date"] = now_iso()
    obj = CashMovement(**data)
    await db.cash_movements.insert_one(obj.model_dump())
    return obj


@api.delete("/cash/{mov_id}")
async def delete_cash(mov_id: str, user: dict = Depends(get_current_user)):
    await db.cash_movements.delete_one({"id": mov_id})
    return {"ok": True}


# ---------- Suppliers ----------
@api.get("/suppliers")
async def list_suppliers(user: dict = Depends(get_current_user), q: Optional[str] = None):
    query = {}
    if q:
        query = {"$or": [
            {"name": {"$regex": q, "$options": "i"}},
            {"contact_name": {"$regex": q, "$options": "i"}},
            {"email": {"$regex": q, "$options": "i"}},
        ]}
    items = await db.suppliers.find(query).sort("name", 1).to_list(1000)
    return [clean(i) for i in items]


@api.post("/suppliers")
async def create_supplier(body: SupplierIn, user: dict = Depends(get_current_user)):
    obj = Supplier(**body.model_dump())
    await db.suppliers.insert_one(obj.model_dump())
    return obj


@api.put("/suppliers/{supplier_id}")
async def update_supplier(supplier_id: str, body: SupplierIn, user: dict = Depends(get_current_user)):
    res = await db.suppliers.update_one({"id": supplier_id}, {"$set": body.model_dump(exclude_unset=True)})
    if res.matched_count == 0:
        raise HTTPException(404, "Fornitore non trovato")
    return clean(await db.suppliers.find_one({"id": supplier_id}))


@api.delete("/suppliers/{supplier_id}")
async def delete_supplier(supplier_id: str, user: dict = Depends(get_current_user)):
    await db.suppliers.delete_one({"id": supplier_id})
    return {"ok": True}


# ---------- Purchase orders ----------
def order_total(items: list) -> float:
    return round(sum(i["quantity"] * i["unit_cost"] for i in items), 2)


def derive_order_status(items: list, current: str) -> str:
    if current == "annullato" or not items:
        return current
    total_q = sum(i["quantity"] for i in items)
    recv = sum(i.get("received_qty", 0) for i in items)
    if recv <= 0:
        return current if current in ("bozza", "ordinato") else "ordinato"
    return "ricevuto" if recv >= total_q else "parziale"


@api.get("/purchase-orders")
async def list_orders(user: dict = Depends(get_current_user), status: Optional[str] = None, supplier_id: Optional[str] = None):
    query = {}
    if status:
        query["status"] = status
    if supplier_id:
        query["supplier_id"] = supplier_id
    items = await db.purchase_orders.find(query).sort("created_at", -1).to_list(2000)
    return [clean(i) for i in items]


@api.post("/purchase-orders")
async def create_order(body: PurchaseOrderIn, user: dict = Depends(get_current_user)):
    seq = await next_sequence("purchase_order")
    data = body.model_dump()
    data["total"] = order_total(data["items"])
    obj = PurchaseOrder(order_number=f"ORD-{seq:05d}", **data)
    await db.purchase_orders.insert_one(obj.model_dump())
    return obj


@api.get("/purchase-orders/{order_id}")
async def get_order(order_id: str, user: dict = Depends(get_current_user)):
    o = await db.purchase_orders.find_one({"id": order_id})
    if not o:
        raise HTTPException(404, "Ordine non trovato")
    return clean(o)


@api.put("/purchase-orders/{order_id}")
async def update_order(order_id: str, body: PurchaseOrderUpdate, user: dict = Depends(get_current_user)):
    existing = await db.purchase_orders.find_one({"id": order_id})
    if not existing:
        raise HTTPException(404, "Ordine non trovato")
    data = body.model_dump(exclude_unset=True)
    if "items" in data:
        data["total"] = order_total(data["items"])
    data["updated_at"] = now_iso()
    await db.purchase_orders.update_one({"id": order_id}, {"$set": data})
    return clean(await db.purchase_orders.find_one({"id": order_id}))


@api.post("/purchase-orders/{order_id}/receive")
async def receive_order(order_id: str, body: ReceiveIn, user: dict = Depends(get_current_user)):
    o = await db.purchase_orders.find_one({"id": order_id})
    if not o:
        raise HTTPException(404, "Ordine non trovato")
    if o["status"] == "annullato":
        raise HTTPException(400, "Ordine annullato")
    items = o["items"]
    spent = 0.0
    for r in body.items:
        if r.index < 0 or r.index >= len(items) or r.quantity <= 0:
            continue
        it = items[r.index]
        remaining = it["quantity"] - it.get("received_qty", 0)
        qty = min(r.quantity, remaining)
        if qty <= 0:
            continue
        it["received_qty"] = it.get("received_qty", 0) + qty
        spent += qty * it["unit_cost"]
        if it.get("part_id"):
            await db.parts.update_one(
                {"id": it["part_id"]},
                {"$inc": {"quantity": qty}, "$set": {"status": "disponibile", "updated_at": now_iso()}},
            )
    status = derive_order_status(items, o["status"])
    upd = {"items": items, "status": status, "updated_at": now_iso()}
    if status == "ricevuto" and not o.get("received_at"):
        upd["received_at"] = now_iso()
    await db.purchase_orders.update_one({"id": order_id}, {"$set": upd})
    if spent > 0:
        mov = CashMovement(
            type="uscita",
            category="acquisto",
            amount=round(spent, 2),
            description=f"Ricambi ordine {o['order_number']} · {o.get('supplier_name') or 'fornitore'}",
            reference_id=order_id,
        )
        await db.cash_movements.insert_one(mov.model_dump())
    return clean(await db.purchase_orders.find_one({"id": order_id}))


@api.delete("/purchase-orders/{order_id}")
async def delete_order(order_id: str, user: dict = Depends(get_current_user)):
    await db.purchase_orders.delete_one({"id": order_id})
    await db.cash_movements.delete_many({"reference_id": order_id})
    return {"ok": True}


# ---------- Refurbished devices ----------
async def enrich_refurb(doc: dict) -> dict:
    doc = clean(doc)
    extra_costs = sum(c["amount"] for c in doc.get("refurb_costs", []))
    parts_cost = 0.0
    repair = None
    if doc.get("repair_id"):
        repair = clean(await db.repairs.find_one({"id": doc["repair_id"]}))
        if repair:
            for pu in repair.get("parts_used", []):
                part = await db.parts.find_one({"id": pu["part_id"]})
                unit = part["cost_price"] if part else pu.get("unit_price", 0)
                parts_cost += unit * pu.get("quantity", 1)
    total_cost = round(doc.get("purchase_cost", 0) + extra_costs + parts_cost, 2)
    doc["parts_cost"] = round(parts_cost, 2)
    doc["extra_costs"] = round(extra_costs, 2)
    doc["total_cost"] = total_cost
    doc["margin"] = round(doc["sale_price"] - total_cost, 2) if doc.get("status") == "venduto" else None
    doc["expected_margin"] = round(doc.get("target_price", 0) - total_cost, 2)
    doc["repair"] = (
        {"ticket_number": repair["ticket_number"], "status": repair["status"], "problem": repair["problem"]}
        if repair else None
    )
    return doc


@api.get("/refurbished")
async def list_refurbished(user: dict = Depends(get_current_user), status: Optional[str] = None, q: Optional[str] = None):
    query = {}
    if status:
        query["status"] = status
    if q:
        query["$or"] = [
            {"code": {"$regex": q, "$options": "i"}},
            {"brand": {"$regex": q, "$options": "i"}},
            {"model": {"$regex": q, "$options": "i"}},
            {"serial_or_imei": {"$regex": q, "$options": "i"}},
        ]
    items = await db.refurbished.find(query).sort("created_at", -1).to_list(2000)
    return [await enrich_refurb(i) for i in items]


@api.get("/refurbished/summary")
async def refurbished_summary(user: dict = Depends(get_current_user)):
    items = [await enrich_refurb(i) for i in await db.refurbished.find({}).to_list(5000)]
    sold = [i for i in items if i["status"] == "venduto"]
    in_stock = [i for i in items if i["status"] != "venduto"]
    return {
        "total": len(items),
        "in_stock": len(in_stock),
        "sold": len(sold),
        "stock_value": round(sum(i["total_cost"] for i in in_stock), 2),
        "revenue": round(sum(i["sale_price"] for i in sold), 2),
        "margin": round(sum(i["margin"] or 0 for i in sold), 2),
    }


@api.post("/refurbished")
async def create_refurbished(body: RefurbishedIn, user: dict = Depends(get_current_user)):
    seq = await next_sequence("refurbished")
    data = body.model_dump(exclude_none=True)
    obj = Refurbished(code=f"RIC-{seq:05d}", **data)
    await db.refurbished.insert_one(obj.model_dump())
    if obj.purchase_cost > 0:
        mov = CashMovement(
            type="uscita",
            category="acquisto",
            amount=obj.purchase_cost,
            description=f"Acquisto dispositivo {obj.code} · {obj.brand or ''} {obj.model or ''}".strip(),
            reference_id=obj.id,
            date=obj.purchase_date,
        )
        await db.cash_movements.insert_one(mov.model_dump())
    return await enrich_refurb(obj.model_dump())


@api.get("/refurbished/{ref_id}")
async def get_refurbished(ref_id: str, user: dict = Depends(get_current_user)):
    r = await db.refurbished.find_one({"id": ref_id})
    if not r:
        raise HTTPException(404, "Dispositivo non trovato")
    return await enrich_refurb(r)


@api.put("/refurbished/{ref_id}")
async def update_refurbished(ref_id: str, body: RefurbishedUpdate, user: dict = Depends(get_current_user)):
    existing = await db.refurbished.find_one({"id": ref_id})
    if not existing:
        raise HTTPException(404, "Dispositivo non trovato")
    data = body.model_dump(exclude_unset=True)
    data["updated_at"] = now_iso()
    await db.refurbished.update_one({"id": ref_id}, {"$set": data})
    if "purchase_cost" in data:
        await db.cash_movements.update_one(
            {"reference_id": ref_id, "category": "acquisto"},
            {"$set": {"amount": float(data["purchase_cost"])}},
        )
    return await enrich_refurb(await db.refurbished.find_one({"id": ref_id}))


@api.post("/refurbished/{ref_id}/costs")
async def add_refurb_cost(ref_id: str, body: RefurbCostIn, user: dict = Depends(get_current_user)):
    existing = await db.refurbished.find_one({"id": ref_id})
    if not existing:
        raise HTTPException(404, "Dispositivo non trovato")
    cost = RefurbCost(**body.model_dump())
    await db.refurbished.update_one(
        {"id": ref_id},
        {"$push": {"refurb_costs": cost.model_dump()}, "$set": {"updated_at": now_iso()}},
    )
    if cost.amount > 0:
        mov = CashMovement(
            type="uscita",
            category="ricondizionamento",
            amount=cost.amount,
            description=f"{existing['code']} · {cost.description}",
            reference_id=cost.id,
        )
        await db.cash_movements.insert_one(mov.model_dump())
    return await enrich_refurb(await db.refurbished.find_one({"id": ref_id}))


@api.delete("/refurbished/{ref_id}/costs/{cost_id}")
async def delete_refurb_cost(ref_id: str, cost_id: str, user: dict = Depends(get_current_user)):
    await db.refurbished.update_one({"id": ref_id}, {"$pull": {"refurb_costs": {"id": cost_id}}})
    await db.cash_movements.delete_many({"reference_id": cost_id})
    return await enrich_refurb(await db.refurbished.find_one({"id": ref_id}))


@api.post("/refurbished/{ref_id}/sell")
async def sell_refurbished(ref_id: str, body: RefurbSellIn, user: dict = Depends(get_current_user)):
    existing = await db.refurbished.find_one({"id": ref_id})
    if not existing:
        raise HTTPException(404, "Dispositivo non trovato")
    if existing["status"] == "venduto":
        raise HTTPException(400, "Dispositivo già venduto")
    enriched = await enrich_refurb(dict(existing))
    seq = await next_sequence("sale")
    desc = f"{existing['code']} · {existing.get('brand') or ''} {existing.get('model') or ''} (ricondizionato)".strip()
    sale = Sale(
        invoice_number=f"VEN-{seq:05d}",
        customer_id=body.customer_id,
        customer_name=body.customer_name,
        items=[SaleItem(description=desc, quantity=1, unit_price=body.sale_price)],
        total=body.sale_price,
        cost_total=enriched["total_cost"],
        margin=round(body.sale_price - enriched["total_cost"], 2),
        payment_method=body.payment_method,
        notes=body.notes,
    )
    await db.sales.insert_one(sale.model_dump())
    mov = CashMovement(
        type="entrata", category="vendita", amount=sale.total,
        description=f"Vendita {sale.invoice_number} · {existing['code']}", reference_id=sale.id,
    )
    await db.cash_movements.insert_one(mov.model_dump())
    await db.refurbished.update_one(
        {"id": ref_id},
        {"$set": {"status": "venduto", "sale_id": sale.id, "sale_price": body.sale_price,
                  "sold_at": now_iso(), "updated_at": now_iso()}},
    )
    return await enrich_refurb(await db.refurbished.find_one({"id": ref_id}))


@api.delete("/refurbished/{ref_id}")
async def delete_refurbished(ref_id: str, user: dict = Depends(get_current_user)):
    existing = await db.refurbished.find_one({"id": ref_id})
    if existing:
        ids = [ref_id] + [c["id"] for c in existing.get("refurb_costs", [])]
        await db.cash_movements.delete_many({"reference_id": {"$in": ids}})
    await db.refurbished.delete_one({"id": ref_id})
    return {"ok": True}


# ---------- Reports / Dashboard ----------
@api.get("/reports/dashboard")
async def dashboard(user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()

    async def sum_cash(match: dict) -> float:
        cursor = db.cash_movements.aggregate([
            {"$match": match},
            {"$group": {"_id": "$type", "total": {"$sum": "$amount"}}},
        ])
        totals = {"entrata": 0.0, "uscita": 0.0}
        async for row in cursor:
            totals[row["_id"]] = row["total"]
        return totals

    today_totals = await sum_cash({"date": {"$gte": start_of_day}})
    month_totals = await sum_cash({"date": {"$gte": start_of_month}})

    open_repairs = await db.repairs.count_documents({"status": {"$in": ["in_attesa", "in_lavorazione"]}})
    completed_repairs = await db.repairs.count_documents({"status": "completata"})
    total_customers = await db.customers.count_documents({})

    parts = await db.parts.find({}).to_list(2000)
    low_stock = [clean(p) for p in parts if p.get("quantity", 0) <= p.get("min_quantity", 0)]
    total_parts_value = sum(p.get("quantity", 0) * p.get("cost_price", 0) for p in parts)

    # daily revenue last 14 days
    daily = []
    for i in range(13, -1, -1):
        day = (now - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        next_day = day + timedelta(days=1)
        row = await sum_cash({"date": {"$gte": day.isoformat(), "$lt": next_day.isoformat()}})
        daily.append({
            "date": day.strftime("%d/%m"),
            "entrate": round(row["entrata"], 2),
            "uscite": round(row["uscita"], 2),
        })

    return {
        "today": {
            "entrate": round(today_totals["entrata"], 2),
            "uscite": round(today_totals["uscita"], 2),
            "netto": round(today_totals["entrata"] - today_totals["uscita"], 2),
        },
        "month": {
            "entrate": round(month_totals["entrata"], 2),
            "uscite": round(month_totals["uscita"], 2),
            "netto": round(month_totals["entrata"] - month_totals["uscita"], 2),
        },
        "open_repairs": open_repairs,
        "completed_repairs": completed_repairs,
        "total_customers": total_customers,
        "low_stock_count": len(low_stock),
        "low_stock_items": low_stock[:10],
        "inventory_value": round(total_parts_value, 2),
        "daily_series": daily,
    }


# ---------- Startup ----------
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.customers.create_index("name")
    await db.parts.create_index("name")
    await db.repairs.create_index("ticket_number")
    await db.sales.create_index("invoice_number")
    await db.cash_movements.create_index("date")

    admin_email = os.environ["ADMIN_EMAIL"].lower()
    admin_password = os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "id": new_id(),
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": "Titolare",
            "role": "admin",
            "created_at": now_iso(),
        })
        logger.info(f"Admin creato: {admin_email}")
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"password_hash": hash_password(admin_password)}},
        )
        logger.info("Password admin aggiornata da .env")


@app.on_event("shutdown")
async def shutdown():
    client.close()


# ---------- Mount ----------
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[os.environ.get("FRONTEND_URL", "*"), "*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
