from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import re
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
    entered_at: Optional[str] = None
    exited_at: Optional[str] = None
    compatible_models: List[str] = []
    brand: Optional[str] = None
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
    entered_at: Optional[str] = None
    exited_at: Optional[str] = None
    compatible_models: List[str] = []
    brand: Optional[str] = None


RepairStatus = Literal["in_attesa", "in_lavorazione", "completata", "consegnata", "annullata"]


class RepairPartUsed(BaseModel):
    part_id: str
    part_name: str
    quantity: int = 1
    unit_price: float = 0.0
    surcharge: float = 0.0


def parts_used_total(parts_used: list) -> float:
    return round(sum(int(p.get("quantity", 1)) * float(p.get("unit_price") or 0) + float(p.get("surcharge") or 0) for p in parts_used or []), 2)


class RepairService(BaseModel):
    service_id: Optional[str] = None
    name: str
    price: float = 0.0


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
    services: List[RepairService] = []
    labor_cost: float = 0.0
    final_price: float = 0.0
    paid: bool = False
    technical_notes: Optional[str] = None
    received_at: Optional[str] = None
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
    services: List[RepairService] = []
    labor_cost: float = 0.0
    final_price: float = 0.0
    paid: bool = False
    technical_notes: Optional[str] = None
    received_at: Optional[str] = None
    delivered_at: Optional[str] = None


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
    services: Optional[List[RepairService]] = None
    labor_cost: Optional[float] = None
    final_price: Optional[float] = None
    paid: Optional[bool] = None
    technical_notes: Optional[str] = None
    received_at: Optional[str] = None
    delivered_at: Optional[str] = None


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
    date: Optional[str] = None


class SaleUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    date: Optional[str] = None
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    payment_method: Optional[str] = None
    notes: Optional[str] = None


def sale_cash_description(sale: dict) -> str:
    names = ", ".join(i["description"] for i in sale.get("items", []) if i.get("description"))
    return f"Vendita {sale['invoice_number']}" + (f" · {names}" if names else "")


def repair_cash_description(rep: dict) -> str:
    dev = " ".join(x for x in [rep.get("device_brand"), rep.get("device_model")] if x)
    return f"Riparazione {rep['ticket_number']}" + (f" · {dev}" if dev else "")


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
    color: Optional[str] = None
    grade: Optional[str] = None
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
    color: Optional[str] = None
    grade: Optional[str] = None
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
    color: Optional[str] = None
    grade: Optional[str] = None
    specs: Optional[str] = None
    purchase_cost: Optional[float] = None
    purchase_source: Optional[str] = None
    supplier_id: Optional[str] = None
    purchase_date: Optional[str] = None
    target_price: Optional[float] = None
    status: Optional[RefurbStatus] = None
    repair_id: Optional[str] = None
    notes: Optional[str] = None
    sold_at: Optional[str] = None
    sale_price: Optional[float] = None


class RefurbCostIn(BaseModel):
    description: str
    amount: float = 0.0


class RefurbSellIn(BaseModel):
    sale_price: float
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    payment_method: str = "contanti"
    notes: Optional[str] = None
    sold_at: Optional[str] = None


class BrandIn(BaseModel):
    name: str


class ColorIn(BaseModel):
    color: str


class PartTemplateIn(BaseModel):
    name: str
    category: Optional[str] = None


class RenameIn(BaseModel):
    old: str
    new: str


class BackupIn(BaseModel):
    collections: dict
    mode: Literal["replace", "merge"] = "replace"


PART_CATEGORY_RULES = [
    ("Schermo", ["schermo", "display", "lcd", "oled", "vetro", "touch", "digitizer"]),
    ("Batteria", ["batteria", "battery", "accumulatore"]),
    ("Connettori", ["connettore", "dock", "porta", "usb", "hdmi", "jack", "lightning", "flex ricarica"]),
    ("Fotocamera", ["fotocamera", "camera", "lente"]),
    ("Audio", ["altoparlante", "speaker", "microfono", "buzzer", "auricolare"]),
    ("Storage", ["ssd", "hdd", "hard disk", "nvme", "m.2", "emmc", "memoria"]),
    ("RAM", ["ram", "ddr4", "ddr5", "sodimm"]),
    ("Alimentazione", ["alimentatore", "caricabatterie", "caricatore", "cavo", "power supply", "dc jack"]),
    ("Raffreddamento", ["ventola", "fan", "dissipatore", "pasta termica", "heatsink"]),
    ("Tastiera / Input", ["tastiera", "keyboard", "trackpad", "touchpad", "tasto", "pulsante", "stick", "joystick"]),
    ("Scocca", ["scocca", "cover", "back cover", "frame", "telaio", "cornice", "cerniera", "hinge"]),
    ("Scheda", ["scheda", "logic board", "motherboard", "mainboard", "chip", "ic", "controller"]),
    ("Sensori / Flex", ["flex", "sensore", "face id", "touch id", "antenna", "vibrazione", "taptic"]),
]


def guess_part_category(name: str) -> Optional[str]:
    n = name.lower()
    for cat, keys in PART_CATEGORY_RULES:
        if any(k in n for k in keys):
            return cat
    return None


PART_TEMPLATE_SEED = [
    "Schermo LCD completo", "Schermo OLED completo", "Vetro posteriore", "Vetro fotocamera", "Batteria",
    "Connettore di ricarica (flex dock)", "Fotocamera posteriore", "Fotocamera frontale", "Altoparlante", "Microfono",
    "Auricolare (speaker superiore)", "Flex tasto power", "Flex tasto volume", "Flex Face ID / sensore prossimità",
    "Motore vibrazione (Taptic)", "Antenna Wi-Fi / Bluetooth", "Lettore SIM", "Scocca / frame", "Back cover",
    "SSD NVMe 512GB", "SSD NVMe 1TB", "SSD SATA 2.5\" 500GB", "RAM DDR4 8GB SO-DIMM", "RAM DDR4 16GB SO-DIMM", "RAM DDR5 16GB SO-DIMM",
    "Tastiera notebook", "Trackpad", "Ventola CPU", "Pasta termica", "Cerniere schermo", "Schermo notebook 15.6\" FHD",
    "Schermo notebook 14\" FHD", "Alimentatore notebook 65W", "Alimentatore USB-C 65W", "Cavo Lightning", "Cavo USB-C",
    "Connettore DC jack notebook", "Porta HDMI console", "Stick analogico joypad", "Ventola console", "Alimentatore console",
    "Lettore ottico console", "Pad conduttivi joypad",
]


class ServiceIn(BaseModel):
    name: str
    category: Optional[str] = None
    device_type: Optional[str] = None
    price: float = 0.0
    duration_minutes: Optional[int] = None
    notes: Optional[str] = None


class Service(ServiceIn):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    created_at: str = Field(default_factory=now_iso)


class OpenRepairIn(BaseModel):
    problem: Optional[str] = None


BRAND_COLORS = {
    "Apple": ["Nero", "Bianco", "Mezzanotte", "Galassia", "Blu", "Rosso", "Verde", "Viola", "Giallo", "Rosa", "Grigio siderale", "Argento", "Oro", "Titanio naturale", "Titanio nero", "Titanio bianco", "Titanio blu"],
    "Samsung": ["Phantom Black", "Phantom White", "Cream", "Green", "Lavender", "Graphite", "Violet", "Awesome Black", "Awesome Silver", "Awesome Lime", "Titanium Gray", "Navy", "Marble Gray"],
    "Xiaomi": ["Nero", "Bianco", "Blu", "Verde", "Grigio", "Viola", "Oro"],
    "Google": ["Obsidian", "Snow", "Hazel", "Lemongrass", "Bay", "Porcelain", "Rose", "Sage"],
    "Sony": ["Nero", "Bianco"],
    "Nintendo": ["Neon Rosso/Blu", "Grigio", "Bianco", "Turchese", "Corallo", "Giallo"],
    "Microsoft": ["Nero carbonio", "Bianco robot", "Platino"],
}
DEFAULT_COLORS = ["Nero", "Bianco", "Grigio", "Argento", "Blu", "Rosso", "Verde", "Oro", "Rosa", "Viola"]
SERVICE_SEED = [
    ("Diagnosi / preventivo", "Generale", None, 15),
    ("Sostituzione schermo smartphone", "Schermo", "Smartphone", 80),
    ("Sostituzione batteria smartphone", "Batteria", "Smartphone", 45),
    ("Sostituzione connettore di ricarica", "Connettori", "Smartphone", 50),
    ("Sostituzione vetro posteriore", "Schermo", "Smartphone", 60),
    ("Sostituzione fotocamera", "Fotocamera", "Smartphone", 55),
    ("Recupero dati / backup", "Software", None, 40),
    ("Formattazione e reinstallazione sistema", "Software", "PC / Notebook", 45),
    ("Rimozione virus / pulizia software", "Software", "PC / Notebook", 35),
    ("Sostituzione SSD + clonazione", "Hardware", "PC / Notebook", 50),
    ("Upgrade RAM", "Hardware", "PC / Notebook", 25),
    ("Pulizia interna e cambio pasta termica", "Manutenzione", "PC / Notebook", 40),
    ("Sostituzione tastiera notebook", "Hardware", "PC / Notebook", 50),
    ("Sostituzione schermo notebook", "Schermo", "PC / Notebook", 90),
    ("Sostituzione porta HDMI console", "Connettori", "Console", 70),
    ("Pulizia e cambio pasta termica console", "Manutenzione", "Console", 50),
    ("Sostituzione stick analogici joypad", "Hardware", "Console", 30),
    ("Sostituzione batteria tablet", "Batteria", "Tablet", 60),
    ("Sostituzione schermo tablet", "Schermo", "Tablet", 100),
]


class ModelIn(BaseModel):
    brand: str
    name: str
    code: Optional[str] = None
    device_type: Optional[str] = None


DEVICE_CATALOG = {
    "Apple": [
        ("iPhone 11", "A2221"), ("iPhone 12", "A2403"), ("iPhone 12 Pro", "A2407"), ("iPhone 13", "A2633"),
        ("iPhone 13 Pro", "A2638"), ("iPhone 14", "A2882"), ("iPhone 14 Pro", "A2890"), ("iPhone 15", "A3090"),
        ("iPhone 15 Pro", "A3102"), ("iPhone 16", "A3287"), ("iPhone 16 Pro", "A3293"), ("iPhone SE 2022", "A2783"),
        ("iPad 9ª gen", "A2602"), ("iPad 10ª gen", "A2696"), ("iPad Air 5", "A2588"), ("iPad Pro 11 M2", "A2759"),
        ("MacBook Air 13 M1", "A2337"), ("MacBook Air 13 M2", "A2681"), ("MacBook Pro 13 M1", "A2338"),
        ("MacBook Pro 14 M3", "A2918"), ("MacBook Pro 16 M3", "A2991"),
    ],
    "Samsung": [
        ("Galaxy S21", "SM-G991B"), ("Galaxy S22", "SM-S901B"), ("Galaxy S23", "SM-S911B"), ("Galaxy S23 Ultra", "SM-S918B"),
        ("Galaxy S24", "SM-S921B"), ("Galaxy S24 Ultra", "SM-S928B"), ("Galaxy S25", "SM-S931B"),
        ("Galaxy A14", "SM-A145F"), ("Galaxy A34", "SM-A346B"), ("Galaxy A54", "SM-A546B"), ("Galaxy A55", "SM-A556B"),
        ("Galaxy Z Flip5", "SM-F731B"), ("Galaxy Z Fold5", "SM-F946B"), ("Galaxy Tab A9", "SM-X110"), ("Galaxy Tab S9", "SM-X710"),
    ],
    "Xiaomi": [
        ("Redmi Note 12", "23021RAAEG"), ("Redmi Note 13", "23124RA7EO"), ("Redmi Note 13 Pro", "2312DRA50G"),
        ("Xiaomi 13", "2211133G"), ("Xiaomi 14", "23127PN0CG"), ("Poco X6 Pro", "2311DRK48G"), ("Poco F5", "23049PCD8G"),
    ],
    "Huawei": [("P30 Pro", "VOG-L29"), ("P40 Lite", "JNY-LX1"), ("Nova 9", "NAM-LX9"), ("MateBook D15", "BoDE-WDH9")],
    "Google": [("Pixel 6", "GB7N6"), ("Pixel 7", "GVU6C"), ("Pixel 7a", "GWKK3"), ("Pixel 8", "GKWS6"), ("Pixel 8 Pro", "GC3VE"), ("Pixel 9", "GUR25")],
    "OnePlus": [("OnePlus 9", "LE2113"), ("OnePlus 10 Pro", "NE2213"), ("OnePlus 11", "CPH2449"), ("OnePlus Nord 3", "CPH2493")],
    "Motorola": [("Moto G54", "XT2343-1"), ("Moto G84", "XT2347-2"), ("Edge 40", "XT2303-2"), ("Edge 50 Pro", "XT2403-1")],
    "Oppo": [("Reno 8", "CPH2359"), ("Reno 10", "CPH2531"), ("A78", "CPH2565"), ("Find X5", "CPH2307")],
    "Realme": [("Realme 11 Pro", "RMX3771"), ("Realme GT 2", "RMX3311"), ("Realme C55", "RMX3710")],
    "Lenovo": [("IdeaPad 3 15", "82H8"), ("IdeaPad Slim 5", "82XF"), ("ThinkPad T14 Gen 3", "21AH"), ("ThinkPad X1 Carbon Gen 10", "21CB"), ("Legion 5 15", "82RB"), ("Tab M10 Plus", "TB128FU")],
    "HP": [("Pavilion 15", "15-eg"), ("HP 15s", "15s-fq"), ("Envy x360 15", "15-ew"), ("EliteBook 840 G9", "6F6D"), ("Victus 16", "16-e0"), ("Omen 16", "16-b0")],
    "Dell": [("Inspiron 15 3520", "P112F"), ("Inspiron 14 5420", "P157G"), ("XPS 13 9315", "P144G"), ("XPS 15 9520", "P91F"), ("Latitude 5530", "P104F"), ("G15 5520", "P105F")],
    "Asus": [("VivoBook 15", "X1504"), ("VivoBook S14", "K3402"), ("ZenBook 14 OLED", "UX3402"), ("TUF Gaming A15", "FA507"), ("ROG Strix G16", "G614"), ("ROG Zephyrus G14", "GA402")],
    "Acer": [("Aspire 3", "A315-24P"), ("Aspire 5", "A515-57"), ("Swift 3", "SF314-512"), ("Nitro 5", "AN515-58"), ("Predator Helios 300", "PH315-55")],
    "MSI": [("Modern 14", "C12M"), ("Katana 15", "B13V"), ("Thin GF63", "12UC"), ("Stealth 16", "A13V")],
    "Sony": [("PlayStation 4 Slim", "CUH-2216"), ("PlayStation 4 Pro", "CUH-7216"), ("PlayStation 5", "CFI-1216"), ("PlayStation 5 Slim", "CFI-2016"), ("Xperia 5 IV", "XQ-CQ54")],
    "Nintendo": [("Switch", "HAC-001"), ("Switch V2", "HAC-001(-01)"), ("Switch Lite", "HDH-001"), ("Switch OLED", "HEG-001")],
    "Microsoft": [("Xbox One S", "1681"), ("Xbox Series S", "1883"), ("Xbox Series X", "1882"), ("Surface Pro 9", "1996"), ("Surface Laptop 5", "1950")],
    "LG": [("TV 55UQ7500", "55UQ75006LF"), ("Monitor 27GL850", "27GL850-B")],
}


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
    if not doc:
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
    data = body.model_dump(exclude_unset=True)
    res = await db.customers.update_one({"id": customer_id}, {"$set": data})
    if res.matched_count == 0:
        raise HTTPException(404, "Cliente non trovato")
    if data.get("name"):
        await db.repairs.update_many({"customer_id": customer_id}, {"$set": {"customer_name": data["name"]}})
        await db.sales.update_many({"id": {"$exists": True}, "customer_id": customer_id}, {"$set": {"customer_name": data["name"]}})
    return clean(await db.customers.find_one({"id": customer_id}))


@api.delete("/customers/{customer_id}")
async def delete_customer(customer_id: str, user: dict = Depends(get_current_user)):
    await db.customers.delete_one({"id": customer_id})
    await db.repairs.update_many({"customer_id": customer_id}, {"$set": {"customer_id": None}})
    await db.sales.update_many({"customer_id": customer_id}, {"$set": {"customer_id": None}})
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
    if not obj.category:
        obj.category = guess_part_category(obj.name)
    await db.parts.insert_one(obj.model_dump())
    await record_part_purchase(obj.model_dump(), obj.quantity)
    return obj


async def record_part_purchase(part: dict, qty: int):
    amount = round(qty * float(part.get("cost_price") or 0), 2)
    if qty <= 0 or amount <= 0:
        return
    mov = CashMovement(
        type="uscita",
        category="acquisto_ricambi",
        amount=amount,
        description=f"Ricambio {part['name']} ×{qty}" + (f" ({part['brand']})" if part.get("brand") else ""),
        reference_id=part["id"],
        date=part.get("entered_at") or now_iso(),
    )
    await db.cash_movements.insert_one(mov.model_dump())


@api.get("/parts/{part_id}")
async def get_part(part_id: str, user: dict = Depends(get_current_user)):
    p = await db.parts.find_one({"id": part_id})
    if not p:
        raise HTTPException(404, "Pezzo non trovato")
    return clean(p)


@api.put("/parts/{part_id}")
async def update_part(part_id: str, body: PartIn, user: dict = Depends(get_current_user)):
    existing = await db.parts.find_one({"id": part_id})
    if not existing:
        raise HTTPException(404, "Pezzo non trovato")
    data = body.model_dump(exclude_unset=True)
    data["updated_at"] = now_iso()
    await db.parts.update_one({"id": part_id}, {"$set": data})
    updated = await db.parts.find_one({"id": part_id})
    delta = int(updated.get("quantity", 0)) - int(existing.get("quantity", 0))
    if delta > 0:
        await record_part_purchase({**updated, "entered_at": None}, delta)
    if updated.get("name") != existing.get("name"):
        await db.repairs.update_many(
            {"parts_used.part_id": part_id},
            {"$set": {"parts_used.$[p].part_name": updated["name"]}},
            array_filters=[{"p.part_id": part_id}],
        )
    if updated.get("entered_at") and updated.get("entered_at") != existing.get("entered_at"):
        movs = await db.cash_movements.find({"reference_id": part_id, "category": "acquisto_ricambi"}).to_list(50)
        if len(movs) == 1:
            await db.cash_movements.update_one({"id": movs[0]["id"]}, {"$set": {"date": updated["entered_at"]}})
    return clean(updated)


@api.delete("/parts/{part_id}")
async def delete_part(part_id: str, user: dict = Depends(get_current_user)):
    await db.parts.delete_one({"id": part_id})
    await db.cash_movements.update_many({"reference_id": part_id}, {"$set": {"reference_id": None}})
    await db.purchase_orders.update_many({"items.part_id": part_id}, {"$set": {"items.$[i].part_id": None}}, array_filters=[{"i.part_id": part_id}])
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


async def sync_refurb_sale_cost(repair_id: str) -> list:
    warnings = []
    ref = await db.refurbished.find_one({"repair_id": repair_id, "status": "venduto"})
    if ref and ref.get("sale_id"):
        enriched = await enrich_refurb(ref)
        res = await db.sales.update_one(
            {"id": ref["sale_id"]},
            {"$set": {"cost_total": enriched["total_cost"], "margin": round(float(ref["sale_price"]) - enriched["total_cost"], 2)}},
        )
        if res.matched_count == 0:
            warnings.append(f"Vendita del ricondizionato {ref['code']} non trovata: costo/margine non aggiornati")
    return warnings


def parts_qty_map(parts_used: list) -> dict:
    out: dict = {}
    for p in parts_used or []:
        pid = p.get("part_id") if isinstance(p, dict) else p.part_id
        qty = p.get("quantity", 1) if isinstance(p, dict) else p.quantity
        if pid:
            out[pid] = out.get(pid, 0) + int(qty or 0)
    return out


async def apply_parts_stock_delta(old_parts: list, new_parts: list):
    old, new = parts_qty_map(old_parts), parts_qty_map(new_parts)
    for pid in set(old) | set(new):
        delta = new.get(pid, 0) - old.get(pid, 0)
        if delta:
            await db.parts.update_one({"id": pid}, {"$inc": {"quantity": -delta}, "$set": {"updated_at": now_iso()}})


@api.post("/repairs")
async def create_repair(body: RepairIn, user: dict = Depends(get_current_user)):
    seq = await next_sequence("repair")
    ticket = f"RIP-{seq:05d}"
    obj = Repair(ticket_number=ticket, **body.model_dump())
    if not obj.received_at:
        obj.received_at = obj.created_at
    await db.repairs.insert_one(obj.model_dump())
    await apply_parts_stock_delta([], obj.model_dump()["parts_used"])
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
    if "parts_used" in data:
        await apply_parts_stock_delta(existing.get("parts_used", []), updated.get("parts_used", []))
    if data.get("status") == "annullata" and existing.get("status") != "annullata":
        await apply_parts_stock_delta(updated.get("parts_used", []), [])
    if updated.get("delivered_at") and updated.get("delivered_at") != existing.get("delivered_at"):
        await db.cash_movements.update_many({"reference_id": repair_id, "category": "riparazione"}, {"$set": {"date": updated["delivered_at"]}})
    if "final_price" in data and float(updated.get("final_price") or 0) != float(existing.get("final_price") or 0):
        await db.cash_movements.update_many({"reference_id": repair_id, "category": "riparazione"}, {"$set": {"amount": float(updated["final_price"])}})
    if updated.get("status") == "consegnata" and not updated.get("paid"):
        await db.cash_movements.delete_many({"reference_id": repair_id, "category": "riparazione"})
    warnings = await sync_refurb_sale_cost(repair_id)
    if "parts_used" in data:
        missing = [p["part_name"] for p in updated.get("parts_used", []) if p.get("part_id") and not await db.parts.find_one({"id": p["part_id"]})]
        if missing:
            warnings.append("Ricambi non più presenti in magazzino: " + ", ".join(missing))
    if any(k in data for k in ("device_brand", "device_model")):
        await db.cash_movements.update_many({"reference_id": repair_id, "category": "riparazione"}, {"$set": {"description": repair_cash_description(updated)}})

    # Se consegnata e pagata registra la cassa (se non già presente)
    if updated.get("status") == "consegnata" and updated.get("paid"):
        exists = await db.cash_movements.find_one({"reference_id": repair_id, "category": "riparazione"})
        if not exists and updated.get("final_price", 0) > 0:
            mov = CashMovement(
                type="entrata",
                category="riparazione",
                amount=float(updated["final_price"]),
                description=repair_cash_description(updated),
                reference_id=repair_id,
                date=updated.get("delivered_at") or now_iso(),
            )
            await db.cash_movements.insert_one(mov.model_dump())
    updated["warnings"] = warnings
    return updated


@api.delete("/repairs/{repair_id}")
async def delete_repair(repair_id: str, restore_parts: bool = True, user: dict = Depends(get_current_user)):
    existing = await db.repairs.find_one({"id": repair_id})
    if existing and restore_parts and existing.get("status") != "annullata":
        await apply_parts_stock_delta(existing.get("parts_used", []), [])
    await db.repairs.delete_one({"id": repair_id})
    await db.cash_movements.delete_many({"reference_id": repair_id})
    await db.refurbished.update_many({"repair_id": repair_id}, {"$set": {"repair_id": None}})
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
    sale_date = data.pop("date", None)
    obj = Sale(invoice_number=invoice, margin=margin, **data)
    if sale_date:
        obj.created_at = sale_date
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
        description=sale_cash_description(obj.model_dump()),
        reference_id=obj.id,
        date=obj.created_at,
    )
    await db.cash_movements.insert_one(mov.model_dump())
    return obj


@api.put("/sales/{sale_id}")
async def update_sale(sale_id: str, body: SaleUpdate, user: dict = Depends(get_current_user)):
    existing = await db.sales.find_one({"id": sale_id})
    if not existing:
        raise HTTPException(404, "Vendita non trovata")
    data = body.model_dump(exclude_unset=True)
    new_date = data.pop("date", None)
    if new_date:
        data["created_at"] = new_date
        await db.cash_movements.update_many({"reference_id": sale_id, "category": "vendita"}, {"$set": {"date": new_date}})
        await db.refurbished.update_many({"sale_id": sale_id}, {"$set": {"sold_at": new_date}})
    if data:
        await db.sales.update_one({"id": sale_id}, {"$set": data})
    fresh = await db.sales.find_one({"id": sale_id})
    await db.cash_movements.update_many({"reference_id": sale_id, "category": "vendita"}, {"$set": {"description": sale_cash_description(fresh)}})
    return clean(fresh)


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
    await db.refurbished.update_many(
        {"sale_id": sale_id},
        {"$set": {"sale_id": None, "status": "pronto", "sale_price": 0.0, "sold_at": None, "updated_at": now_iso()}},
    )
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
    await sync_cash()
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
    m = await db.cash_movements.find_one({"id": mov_id})
    if m and m.get("reference_id"):
        if m.get("category") == "vendita" and await db.sales.find_one({"id": m["reference_id"]}):
            raise HTTPException(400, "Movimento collegato a una vendita: elimina la vendita per rimuovere l'incasso")
        if m.get("category") == "riparazione" and await db.repairs.find_one({"id": m["reference_id"]}):
            raise HTTPException(400, "Movimento collegato a una riparazione pagata: modifica la riparazione")
    await db.cash_movements.delete_one({"id": mov_id})
    return {"ok": True}


async def sync_sales_cash(stats: dict) -> set:
    sale_ids = set()
    async for sale in db.sales.find({}):
        sale_ids.add(sale["id"])
        mov = await db.cash_movements.find_one({"reference_id": sale["id"], "category": "vendita"})
        desc = sale_cash_description(sale)
        if not mov:
            m = CashMovement(type="entrata", category="vendita", amount=float(sale["total"]),
                             description=desc, reference_id=sale["id"], date=sale["created_at"])
            await db.cash_movements.insert_one(m.model_dump())
            stats["sales_added"] += 1
        elif abs(float(mov["amount"]) - float(sale["total"])) > 0.005 or mov.get("description") != desc or mov.get("date") != sale["created_at"]:
            await db.cash_movements.update_one({"id": mov["id"]}, {"$set": {"amount": float(sale["total"]), "description": desc, "date": sale["created_at"]}})
            stats["sales_fixed"] += 1
    return sale_ids


async def remove_orphan_sale_movements(sale_ids: set, stats: dict):
    async for mov in db.cash_movements.find({"category": "vendita", "reference_id": {"$ne": None}}):
        if mov["reference_id"] not in sale_ids:
            await db.cash_movements.delete_one({"id": mov["id"]})
            stats["orphans_removed"] += 1


async def sync_repairs_cash(stats: dict):
    async for rep in db.repairs.find({"status": "consegnata", "paid": True, "final_price": {"$gt": 0}}):
        mov = await db.cash_movements.find_one({"reference_id": rep["id"], "category": "riparazione"})
        if mov:
            desc = repair_cash_description(rep)
            want_date = rep.get("delivered_at") or mov["date"]
            if mov.get("description") != desc or mov.get("date") != want_date:
                await db.cash_movements.update_one({"id": mov["id"]}, {"$set": {"description": desc, "date": want_date}})
            continue
        m = CashMovement(type="entrata", category="riparazione", amount=float(rep["final_price"]),
                         description=repair_cash_description(rep), reference_id=rep["id"],
                         date=rep.get("delivered_at") or rep["updated_at"])
        await db.cash_movements.insert_one(m.model_dump())
        stats["repairs_added"] += 1


async def sync_parts_cash(stats: dict):
    async for part in db.parts.find({"cost_price": {"$gt": 0}, "quantity": {"$gt": 0}}):
        movs = await db.cash_movements.find({"reference_id": part["id"], "category": "acquisto_ricambi"}).to_list(50)
        if movs:
            if len(movs) == 1 and part.get("entered_at") and movs[0].get("date") != part["entered_at"]:
                await db.cash_movements.update_one({"id": movs[0]["id"]}, {"$set": {"date": part["entered_at"]}})
            continue
        await record_part_purchase({**part, "entered_at": part.get("entered_at") or part.get("created_at")}, int(part["quantity"]))
        stats["parts_added"] += 1


async def sync_cash() -> dict:
    stats = {"sales_added": 0, "sales_fixed": 0, "orphans_removed": 0, "repairs_added": 0, "parts_added": 0}
    sale_ids = await sync_sales_cash(stats)
    await remove_orphan_sale_movements(sale_ids, stats)
    await sync_repairs_cash(stats)
    await sync_parts_cash(stats)
    return stats


@api.post("/cash/sync")
async def cash_sync(user: dict = Depends(get_current_user)):
    return await sync_cash()


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


async def apply_receipt_line(items: list, r: ReceiveItem) -> float:
    if r.index < 0 or r.index >= len(items) or r.quantity <= 0:
        return 0.0
    it = items[r.index]
    qty = min(r.quantity, it["quantity"] - it.get("received_qty", 0))
    if qty <= 0:
        return 0.0
    it["received_qty"] = it.get("received_qty", 0) + qty
    if it.get("part_id"):
        await db.parts.update_one(
            {"id": it["part_id"]},
            {"$inc": {"quantity": qty}, "$set": {"status": "disponibile", "updated_at": now_iso()}},
        )
    return qty * it["unit_cost"]


async def record_order_expense(order: dict, spent: float):
    if spent <= 0:
        return
    mov = CashMovement(
        type="uscita",
        category="acquisto",
        amount=round(spent, 2),
        description=f"Ricambi ordine {order['order_number']} · {order.get('supplier_name') or 'fornitore'}",
        reference_id=order["id"],
    )
    await db.cash_movements.insert_one(mov.model_dump())


@api.post("/purchase-orders/{order_id}/receive")
async def receive_order(order_id: str, body: ReceiveIn, user: dict = Depends(get_current_user)):
    o = await db.purchase_orders.find_one({"id": order_id})
    if not o:
        raise HTTPException(404, "Ordine non trovato")
    if o["status"] == "annullato":
        raise HTTPException(400, "Ordine annullato")
    items = o["items"]
    spent = sum([await apply_receipt_line(items, r) for r in body.items])
    status = derive_order_status(items, o["status"])
    upd = {"items": items, "status": status, "updated_at": now_iso()}
    if status == "ricevuto" and not o.get("received_at"):
        upd["received_at"] = now_iso()
    await db.purchase_orders.update_one({"id": order_id}, {"$set": upd})
    await record_order_expense(o, spent)
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
            parts_cost = parts_used_total(repair.get("parts_used", []))
    total_cost = round(doc.get("purchase_cost", 0) + extra_costs + parts_cost, 2)
    doc["parts_cost"] = round(parts_cost, 2)
    doc["extra_costs"] = round(extra_costs, 2)
    doc["total_cost"] = total_cost
    doc["margin"] = round(doc["sale_price"] - total_cost, 2) if doc.get("status") == "venduto" else None
    doc["expected_margin"] = round(doc.get("target_price", 0) - total_cost, 2)
    doc["repair"] = (
        {"ticket_number": repair["ticket_number"], "status": repair["status"], "problem": repair["problem"],
         "parts_used": repair.get("parts_used", []), "id": repair["id"]}
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
    warnings: list = []
    fresh = await db.refurbished.find_one({"id": ref_id})
    if "purchase_cost" in data or "purchase_date" in data or "brand" in data or "model" in data:
        await sync_refurb_purchase_movement(fresh)
    if existing.get("sale_id") and ("sold_at" in data or "sale_price" in data):
        sale_doc = await db.sales.find_one({"id": existing["sale_id"]})
        if not sale_doc:
            warnings.append(f"Vendita collegata non trovata: prezzo/data non propagati alla sezione Vendite")
        upd = {}
        if data.get("sold_at"):
            upd["created_at"] = data["sold_at"]
            await db.cash_movements.update_many({"reference_id": existing["sale_id"], "category": "vendita"}, {"$set": {"date": data["sold_at"]}})
        if data.get("sale_price") is not None:
            upd["total"] = float(data["sale_price"])
            upd["items.0.unit_price"] = float(data["sale_price"])
            upd["margin"] = round(float(data["sale_price"]) - float((sale_doc or {}).get("cost_total", 0)), 2)
            await db.cash_movements.update_many({"reference_id": existing["sale_id"], "category": "vendita"}, {"$set": {"amount": float(data["sale_price"])}})
        if upd and sale_doc:
            await db.sales.update_one({"id": existing["sale_id"]}, {"$set": upd})
    out = await enrich_refurb(fresh)
    out["warnings"] = warnings
    return out


def refurb_purchase_description(d: dict) -> str:
    return f"Acquisto dispositivo {d['code']} · {d.get('brand') or ''} {d.get('model') or ''}".strip()


async def sync_refurb_purchase_movement(d: dict) -> bool:
    """Allinea (crea/aggiorna/rimuove) l'uscita di cassa 'acquisto' del ricondizionato. Ritorna True se ha modificato."""
    mov = await db.cash_movements.find_one({"reference_id": d["id"], "category": "acquisto"})
    cost = float(d.get("purchase_cost") or 0)
    if cost <= 0:
        if mov:
            await db.cash_movements.delete_one({"id": mov["id"]})
            return True
        return False
    want = {"amount": cost, "description": refurb_purchase_description(d), "date": d.get("purchase_date") or d.get("created_at")}
    if not mov:
        await db.cash_movements.insert_one(CashMovement(type="uscita", category="acquisto", reference_id=d["id"], **want).model_dump())
        return True
    if abs(float(mov["amount"]) - cost) > 0.005 or mov.get("description") != want["description"] or mov.get("date") != want["date"]:
        await db.cash_movements.update_one({"id": mov["id"]}, {"$set": want})
        return True
    return False


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
    sold_at = body.sold_at or now_iso()
    sale.created_at = sold_at
    await db.sales.insert_one(sale.model_dump())
    mov = CashMovement(
        type="entrata", category="vendita", amount=sale.total,
        description=sale_cash_description(sale.model_dump()), reference_id=sale.id, date=sold_at,
    )
    await db.cash_movements.insert_one(mov.model_dump())
    await db.refurbished.update_one(
        {"id": ref_id},
        {"$set": {"status": "venduto", "sale_id": sale.id, "sale_price": body.sale_price,
                  "sold_at": sold_at, "updated_at": now_iso()}},
    )
    if existing.get("repair_id"):
        rep = await db.repairs.find_one({"id": existing["repair_id"], "status": {"$nin": ["consegnata", "annullata"]}})
        if rep:
            note = f"Chiusa automaticamente: dispositivo {existing['code']} venduto con {sale.invoice_number}"
            notes = f"{rep['technical_notes']}\n{note}" if rep.get("technical_notes") else note
            await db.repairs.update_one(
                {"id": rep["id"]},
                {"$set": {"status": "consegnata", "delivered_at": now_iso(), "updated_at": now_iso(), "technical_notes": notes}},
            )
    return await enrich_refurb(await db.refurbished.find_one({"id": ref_id}))


@api.post("/refurbished/{ref_id}/open-repair")
async def open_repair_from_refurb(ref_id: str, body: OpenRepairIn, user: dict = Depends(get_current_user)):
    d = await db.refurbished.find_one({"id": ref_id})
    if not d:
        raise HTTPException(404, "Dispositivo non trovato")
    if d.get("repair_id") and await db.repairs.find_one({"id": d["repair_id"], "status": {"$nin": ["consegnata", "annullata"]}}):
        raise HTTPException(400, "Esiste già una riparazione aperta per questo dispositivo")
    seq = await next_sequence("repair")
    repair = Repair(
        ticket_number=f"RIP-{seq:05d}",
        customer_name=f"Laboratorio · {d['code']}",
        device_type=d["device_type"],
        device_brand=d.get("brand"),
        device_model=d.get("model"),
        serial_or_imei=d.get("serial_or_imei"),
        problem=body.problem or f"Ricondizionamento {d['code']}",
        status="in_lavorazione",
    )
    repair.received_at = repair.created_at
    await db.repairs.insert_one(repair.model_dump())
    new_status = "in_ricondizionamento" if d["status"] in ("acquistato", "pronto") else d["status"]
    await db.refurbished.update_one({"id": ref_id}, {"$set": {"repair_id": repair.id, "status": new_status, "updated_at": now_iso()}})
    return {"repair": repair, "refurbished": await enrich_refurb(await db.refurbished.find_one({"id": ref_id}))}


@api.delete("/refurbished/{ref_id}")
async def delete_refurbished(
    ref_id: str, delete_sale: bool = False, restore_parts: bool = False,
    cancel_cash: bool = True, delete_repair: bool = True, user: dict = Depends(get_current_user),
):
    existing = await db.refurbished.find_one({"id": ref_id})
    warnings: list = []
    if existing:
        ids = [ref_id] + [c["id"] for c in existing.get("refurb_costs", [])]
        if cancel_cash:
            await db.cash_movements.delete_many({"reference_id": {"$in": ids}})
        else:
            await db.cash_movements.update_many({"reference_id": {"$in": ids}}, {"$set": {"reference_id": None}})
        if existing.get("sale_id"):
            if delete_sale:
                await db.sales.delete_one({"id": existing["sale_id"]})
                if cancel_cash:
                    await db.cash_movements.delete_many({"reference_id": existing["sale_id"]})
                else:
                    await db.cash_movements.update_many({"reference_id": existing["sale_id"]}, {"$set": {"reference_id": None}})
            elif not await db.sales.find_one({"id": existing["sale_id"]}):
                warnings.append("La vendita collegata non è stata trovata")
        if existing.get("repair_id"):
            rep = await db.repairs.find_one({"id": existing["repair_id"]})
            if rep and delete_repair:
                if restore_parts and rep.get("status") != "annullata":
                    await apply_parts_stock_delta(rep.get("parts_used", []), [])
                await db.repairs.delete_one({"id": rep["id"]})
                if cancel_cash:
                    await db.cash_movements.delete_many({"reference_id": rep["id"]})
                else:
                    await db.cash_movements.update_many({"reference_id": rep["id"]}, {"$set": {"reference_id": None}})
            elif not rep:
                warnings.append("La riparazione collegata non è stata trovata")
    await db.refurbished.delete_one({"id": ref_id})
    return {"ok": True, "warnings": warnings}


# ---------- Device catalog ----------
@api.get("/catalog/brands")
async def list_brands(user: dict = Depends(get_current_user)):
    items = await db.device_brands.find({}).sort("name", 1).to_list(500)
    return [clean(i) for i in items]


@api.post("/catalog/brands")
async def create_brand(body: BrandIn, user: dict = Depends(get_current_user)):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Nome marca obbligatorio")
    existing = await db.device_brands.find_one({"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}})
    if existing:
        return clean(existing)
    doc = {"id": new_id(), "name": name, "custom": True, "created_at": now_iso()}
    await db.device_brands.insert_one(doc)
    return clean(doc)


@api.put("/catalog/brands/{brand_id}")
async def rename_brand(brand_id: str, body: BrandIn, user: dict = Depends(get_current_user)):
    b = await db.device_brands.find_one({"id": brand_id})
    if not b:
        raise HTTPException(404, "Marca non trovata")
    new = body.name.strip()
    if not new:
        raise HTTPException(400, "Nome marca obbligatorio")
    old = b["name"]
    if new != old:
        await db.device_brands.update_one({"id": brand_id}, {"$set": {"name": new}})
        await db.device_models.update_many({"brand": old}, {"$set": {"brand": new}})
        await db.repairs.update_many({"device_brand": old}, {"$set": {"device_brand": new}})
        await db.refurbished.update_many({"brand": old}, {"$set": {"brand": new}})
        async for p in db.parts.find({"compatible_models": {"$regex": f"^{re.escape(old)}( |$)"}}):
            cm = [re.sub(f"^{re.escape(old)}(?= |$)", new, m) for m in p.get("compatible_models", [])]
            await db.parts.update_one({"id": p["id"]}, {"$set": {"compatible_models": cm}})
    return clean(await db.device_brands.find_one({"id": brand_id}))


@api.delete("/catalog/brands/{brand_id}")
async def delete_brand(brand_id: str, user: dict = Depends(get_current_user)):
    b = await db.device_brands.find_one({"id": brand_id})
    if b:
        await db.device_models.delete_many({"brand": b["name"]})
        await db.device_brands.delete_one({"id": brand_id})
    return {"ok": True}


@api.get("/catalog/models")
async def list_models(user: dict = Depends(get_current_user), brand: Optional[str] = None):
    query = {"brand": brand} if brand else {}
    items = await db.device_models.find(query).sort("name", 1).to_list(2000)
    return [clean(i) for i in items]


@api.post("/catalog/models")
async def create_model(body: ModelIn, user: dict = Depends(get_current_user)):
    name = body.name.strip()
    if not name or not body.brand.strip():
        raise HTTPException(400, "Marca e modello obbligatori")
    await create_brand(BrandIn(name=body.brand), user)
    existing = await db.device_models.find_one({"brand": body.brand, "name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}})
    if existing:
        return clean(existing)
    doc = {"id": new_id(), "brand": body.brand.strip(), "name": name, "code": (body.code or "").strip() or None,
           "device_type": body.device_type, "custom": True, "created_at": now_iso()}
    await db.device_models.insert_one(doc)
    return clean(doc)


@api.put("/catalog/models/{model_id}")
async def rename_model(model_id: str, body: ModelIn, user: dict = Depends(get_current_user)):
    m = await db.device_models.find_one({"id": model_id})
    if not m:
        raise HTTPException(404, "Modello non trovato")
    new = body.name.strip()
    if not new:
        raise HTTPException(400, "Nome modello obbligatorio")
    upd = {"name": new, "code": (body.code or "").strip() or m.get("code")}
    await db.device_models.update_one({"id": model_id}, {"$set": upd})
    if new != m["name"]:
        await db.repairs.update_many({"device_brand": m["brand"], "device_model": m["name"]}, {"$set": {"device_model": new}})
        await db.refurbished.update_many({"brand": m["brand"], "model": m["name"]}, {"$set": {"model": new}})
        old_label, new_label = f"{m['brand']} {m['name']}", f"{m['brand']} {new}"
        async for p in db.parts.find({"compatible_models": old_label}):
            cm = [new_label if x == old_label else x for x in p.get("compatible_models", [])]
            await db.parts.update_one({"id": p["id"]}, {"$set": {"compatible_models": cm}})
    return clean(await db.device_models.find_one({"id": model_id}))


@api.delete("/catalog/models/{model_id}")
async def delete_model(model_id: str, user: dict = Depends(get_current_user)):
    await db.device_models.delete_one({"id": model_id})
    return {"ok": True}


@api.post("/catalog/models/{model_id}/colors")
async def add_model_color(model_id: str, body: ColorIn, user: dict = Depends(get_current_user)):
    color = body.color.strip()
    if not color:
        raise HTTPException(400, "Colore obbligatorio")
    res = await db.device_models.update_one({"id": model_id}, {"$addToSet": {"colors": color}})
    if res.matched_count == 0:
        raise HTTPException(404, "Modello non trovato")
    return clean(await db.device_models.find_one({"id": model_id}))


class ColorRenameIn(BaseModel):
    old: str
    new: Optional[str] = None


@api.put("/catalog/models/{model_id}/colors")
async def rename_or_delete_color(model_id: str, body: ColorRenameIn, user: dict = Depends(get_current_user)):
    m = await db.device_models.find_one({"id": model_id})
    if not m:
        raise HTTPException(404, "Modello non trovato")
    new = (body.new or "").strip()
    await db.device_models.update_one({"id": model_id}, {"$pull": {"colors": body.old}})
    if new:
        await db.device_models.update_one({"id": model_id}, {"$addToSet": {"colors": new}})
    await db.refurbished.update_many(
        {"brand": m["brand"], "model": m["name"], "color": body.old},
        {"$set": {"color": new or None}},
    )
    return clean(await db.device_models.find_one({"id": model_id}))


@api.get("/catalog/colors")
async def list_colors(user: dict = Depends(get_current_user), brand: Optional[str] = None, model: Optional[str] = None):
    colors: List[str] = []
    m = await db.device_models.find_one({"brand": brand, "name": model}) if brand and model else None
    if m:
        colors += m.get("colors") or []
    for c in BRAND_COLORS.get(brand or "", []) + DEFAULT_COLORS:
        if c not in colors:
            colors.append(c)
    return {"colors": colors, "model_id": m["id"] if m else None}


# ---------- Part templates ----------
@api.get("/catalog/parts")
async def list_part_templates(user: dict = Depends(get_current_user)):
    items = await db.part_templates.find({}).sort([("category", 1), ("name", 1)]).to_list(1000)
    return [clean(i) for i in items]


@api.post("/catalog/parts")
async def create_part_template(body: PartTemplateIn, user: dict = Depends(get_current_user)):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Nome ricambio obbligatorio")
    existing = await db.part_templates.find_one({"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}})
    if existing:
        return clean(existing)
    doc = {"id": new_id(), "name": name, "category": (body.category or "").strip() or guess_part_category(name) or "Altro",
           "custom": True, "created_at": now_iso()}
    await db.part_templates.insert_one(doc)
    return clean(doc)


@api.delete("/catalog/parts/{tpl_id}")
async def delete_part_template(tpl_id: str, user: dict = Depends(get_current_user)):
    await db.part_templates.delete_one({"id": tpl_id})
    return {"ok": True}


@api.put("/catalog/parts/{tpl_id}")
async def update_part_template(tpl_id: str, body: PartTemplateIn, user: dict = Depends(get_current_user)):
    tpl = await db.part_templates.find_one({"id": tpl_id})
    if not tpl:
        raise HTTPException(404, "Ricambio non trovato")
    name = body.name.strip()
    cat = (body.category or "").strip() or guess_part_category(name) or "Altro"
    await db.part_templates.update_one({"id": tpl_id}, {"$set": {"name": name, "category": cat}})
    if name != tpl["name"]:
        await db.parts.update_many({"name": tpl["name"]}, {"$set": {"name": name}})
    return clean(await db.part_templates.find_one({"id": tpl_id}))


@api.get("/catalog/part-categories")
async def list_part_categories(user: dict = Depends(get_current_user)):
    a = await db.part_templates.distinct("category")
    b = await db.parts.distinct("category")
    cats = sorted({c for c in a + b if c}, key=str.lower)
    counts = {c: await db.parts.count_documents({"category": c}) for c in cats}
    return [{"name": c, "parts": counts[c]} for c in cats]


@api.put("/catalog/part-categories/rename")
async def rename_part_category(body: RenameIn, user: dict = Depends(get_current_user)):
    new = body.new.strip()
    if not new:
        raise HTTPException(400, "Nome categoria obbligatorio")
    r1 = await db.parts.update_many({"category": body.old}, {"$set": {"category": new}})
    r2 = await db.part_templates.update_many({"category": body.old}, {"$set": {"category": new}})
    return {"parts": r1.modified_count, "templates": r2.modified_count}


@api.put("/catalog/part-categories/delete")
async def delete_part_category(body: BrandIn, user: dict = Depends(get_current_user)):
    r1 = await db.parts.update_many({"category": body.name}, {"$set": {"category": None}})
    r2 = await db.part_templates.update_many({"category": body.name}, {"$set": {"category": "Altro"}})
    return {"parts": r1.modified_count, "templates": r2.modified_count}


@api.put("/catalog/part-brands/rename")
async def rename_part_brand(body: RenameIn, user: dict = Depends(get_current_user)):
    new = body.new.strip() or None
    r = await db.parts.update_many({"brand": body.old}, {"$set": {"brand": new}})
    return {"parts": r.modified_count}


@api.get("/catalog/part-brands")
async def list_part_brands(user: dict = Depends(get_current_user)):
    brands = await db.parts.distinct("brand")
    base = ["Originale (OEM)", "Compatibile / aftermarket", "Rigenerato", "Apple", "Samsung", "Xiaomi", "Huawei", "LG",
            "BOE", "Tianma", "JDI", "Kingston", "Samsung Memory", "Crucial", "WD", "Seagate", "Corsair", "Sony", "Nintendo"]
    return sorted({b for b in brands + base if b}, key=str.lower)


@api.get("/catalog/parts/guess-category")
async def guess_category(name: str, user: dict = Depends(get_current_user)):
    return {"category": guess_part_category(name)}


# ---------- Services price list ----------
@api.get("/services")
async def list_services(user: dict = Depends(get_current_user), q: Optional[str] = None, device_type: Optional[str] = None):
    query = {}
    if q:
        query["$or"] = [{"name": {"$regex": q, "$options": "i"}}, {"category": {"$regex": q, "$options": "i"}}]
    if device_type:
        query["$or"] = [{"device_type": device_type}, {"device_type": None}]
    items = await db.services.find(query).sort([("category", 1), ("name", 1)]).to_list(1000)
    return [clean(i) for i in items]


@api.post("/services")
async def create_service(body: ServiceIn, user: dict = Depends(get_current_user)):
    obj = Service(**body.model_dump())
    await db.services.insert_one(obj.model_dump())
    return obj


@api.put("/services/{service_id}")
async def update_service(service_id: str, body: ServiceIn, user: dict = Depends(get_current_user)):
    res = await db.services.update_one({"id": service_id}, {"$set": body.model_dump(exclude_unset=True)})
    if res.matched_count == 0:
        raise HTTPException(404, "Intervento non trovato")
    return clean(await db.services.find_one({"id": service_id}))


@api.delete("/services/{service_id}")
async def delete_service(service_id: str, user: dict = Depends(get_current_user)):
    await db.services.delete_one({"id": service_id})
    return {"ok": True}


# ---------- Device history by serial ----------
@api.get("/devices/history")
async def device_history(serial: str, exclude_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    s = serial.strip()
    if len(s) < 4:
        return {"repairs": [], "refurbished": []}
    rx = {"$regex": f"^{re.escape(s)}$", "$options": "i"}
    repairs = await db.repairs.find({"serial_or_imei": rx, "id": {"$ne": exclude_id}}).sort("created_at", -1).to_list(50)
    refurb = await db.refurbished.find({"serial_or_imei": rx, "id": {"$ne": exclude_id}}).sort("created_at", -1).to_list(50)
    return {
        "repairs": [{k: r.get(k) for k in ("id", "ticket_number", "status", "problem", "diagnosis", "customer_name",
                                          "device_brand", "device_model", "final_price", "created_at", "delivered_at")} for r in repairs],
        "refurbished": [{k: r.get(k) for k in ("id", "code", "status", "brand", "model", "purchase_cost", "sale_price", "created_at")} for r in refurb],
    }


# ---------- Cash reference ----------
@api.get("/cash/{mov_id}/reference")
async def cash_reference(mov_id: str, user: dict = Depends(get_current_user)):
    m = await db.cash_movements.find_one({"id": mov_id})
    if not m:
        raise HTTPException(404, "Movimento non trovato")
    ref = m.get("reference_id")
    if not ref:
        return {"type": None, "data": None}
    r = await db.repairs.find_one({"id": ref})
    if r:
        return {"type": "repair", "data": clean(r)}
    s = await db.sales.find_one({"id": ref})
    if s:
        return {"type": "sale", "data": clean(s)}
    o = await db.purchase_orders.find_one({"id": ref})
    if o:
        return {"type": "order", "data": clean(o)}
    d = await db.refurbished.find_one({"$or": [{"id": ref}, {"refurb_costs.id": ref}]})
    if d:
        return {"type": "refurbished", "data": await enrich_refurb(d)}
    p = await db.parts.find_one({"id": ref})
    if p:
        return {"type": "part", "data": clean(p)}
    return {"type": None, "data": None}


# ---------- Backup ----------
MODEL_BY_COLLECTION = {
    "customers": Customer, "parts": Part, "repairs": Repair, "sales": Sale, "cash_movements": CashMovement,
    "suppliers": Supplier, "purchase_orders": PurchaseOrder, "refurbished": Refurbished, "services": Service,
}
BACKUP_COLLECTIONS = ["customers", "parts", "repairs", "sales", "cash_movements", "suppliers", "purchase_orders",
                      "refurbished", "device_brands", "device_models", "services", "part_templates", "counters"]


@api.get("/backup/export")
async def export_backup(user: dict = Depends(get_current_user)):
    data = {}
    for name in BACKUP_COLLECTIONS:
        docs = await db[name].find({}).to_list(100000)
        data[name] = docs if name == "counters" else [clean(d) for d in docs]
    return {"version": 1, "exported_at": now_iso(), "collections": data}


def validate_backup_payload(collections: dict):
    unknown = [k for k in collections if k not in BACKUP_COLLECTIONS]
    if unknown:
        raise HTTPException(400, f"Collezioni non riconosciute: {', '.join(unknown)}")
    bad = [k for k, v in collections.items() if not isinstance(v, list)]
    if bad:
        raise HTTPException(400, f"Formato non valido per {', '.join(bad)}")


async def replace_collection(name: str, docs: list) -> int:
    await db[name].delete_many({})
    if docs:
        await db[name].insert_many([dict(d) for d in docs])
    return len(docs)


def merge_key(name: str, doc: dict) -> Optional[dict]:
    if name == "counters":
        return {"_id": doc["_id"]} if "_id" in doc else None
    return {"id": doc["id"]} if doc.get("id") else None


async def merge_collection(name: str, docs: list) -> int:
    n = 0
    for d in docs:
        key = merge_key(name, d)
        if key:
            await db[name].replace_one(key, dict(d), upsert=True)
            n += 1
    return n


REQUIRED_FIELDS = {
    "customers": ["name"], "parts": ["name"], "repairs": ["ticket_number", "device_type", "problem"],
    "sales": ["invoice_number", "items", "total"], "cash_movements": ["type", "category", "amount", "date"],
    "refurbished": ["code", "device_type"], "device_brands": ["name"], "device_models": ["brand", "name"],
    "services": ["name", "price"], "part_templates": ["name"], "suppliers": ["name"], "purchase_orders": ["order_number", "items"],
}
ENUMS = {
    "repairs": {"status": ["in_attesa", "in_lavorazione", "completata", "consegnata", "annullata"]},
    "cash_movements": {"type": ["entrata", "uscita"]},
    "refurbished": {"status": ["acquistato", "in_ricondizionamento", "pronto", "venduto"]},
    "purchase_orders": {"status": ["bozza", "ordinato", "parziale", "ricevuto", "annullato"]},
    "parts": {"condition": ["nuovo", "usato", "ricondizionato"], "status": ["disponibile", "in_uso", "difettoso", "esaurito"]},
}
NUMERIC_FIELDS = {
    "parts": ["quantity", "cost_price", "sell_price"], "repairs": ["estimate", "final_price", "labor_cost"],
    "sales": ["total", "cost_total", "margin"], "cash_movements": ["amount"], "refurbished": ["purchase_cost", "target_price", "sale_price"],
    "services": ["price"],
}
REFERENCES = {
    "repairs": [("customer_id", "customers")],
    "sales": [("customer_id", "customers")],
    "refurbished": [("repair_id", "repairs"), ("sale_id", "sales")],
}


def issue(coll, idx, doc, field, msg, severity="error"):
    return {"collection": coll, "index": idx, "id": doc.get("id") if isinstance(doc, dict) else None,
            "field": field, "message": msg, "severity": severity}


def validate_doc(coll: str, idx: int, d, seen_ids: set, issues: list):
    if not isinstance(d, dict):
        issues.append(issue(coll, idx, {}, None, "Il record non è un oggetto"))
        return
    if coll != "counters":
        if not d.get("id"):
            issues.append(issue(coll, idx, d, "id", "Manca l'identificativo"))
        elif d["id"] in seen_ids:
            issues.append(issue(coll, idx, d, "id", "Identificativo duplicato nel backup"))
        seen_ids.add(d.get("id"))
    for f in REQUIRED_FIELDS.get(coll, []):
        if d.get(f) in (None, "", []):
            issues.append(issue(coll, idx, d, f, f"Campo obbligatorio mancante: {f}"))
    for f, allowed in ENUMS.get(coll, {}).items():
        if d.get(f) is not None and d[f] not in allowed:
            issues.append(issue(coll, idx, d, f, f"Valore '{d[f]}' non valido (ammessi: {', '.join(allowed)})"))
    for f in NUMERIC_FIELDS.get(coll, []):
        v = d.get(f)
        if v is not None and not isinstance(v, (int, float)):
            issues.append(issue(coll, idx, d, f, f"Valore non numerico: {v!r}"))
    model = MODEL_BY_COLLECTION.get(coll)
    if model:
        unknown = [k for k in d if k not in model.model_fields and k != "_id"]
        if unknown:
            issues.append(issue(coll, idx, d, ",".join(unknown), f"Campi sconosciuti (verranno ignorati): {', '.join(unknown)}", "warning"))


async def validate_references(collections: dict, issues: list):
    for coll, refs in REFERENCES.items():
        docs = collections.get(coll) or []
        for field, target in refs:
            ids_in_backup = {x.get("id") for x in (collections.get(target) or []) if isinstance(x, dict)}
            for idx, d in enumerate(docs):
                ref = d.get(field) if isinstance(d, dict) else None
                if ref and ref not in ids_in_backup and not await db[target].find_one({"id": ref}):
                    issues.append(issue(coll, idx, d, field, f"Riferimento a {target} inesistente ({ref})", "warning"))


@api.post("/backup/validate")
async def validate_backup(body: BackupIn, user: dict = Depends(get_current_user)):
    unknown = [k for k in body.collections if k not in BACKUP_COLLECTIONS]
    issues = [{"collection": k, "index": None, "id": None, "field": None, "message": "Collezione sconosciuta: verrà ignorata", "severity": "warning"} for k in unknown]
    for coll, docs in body.collections.items():
        if coll in unknown:
            continue
        if not isinstance(docs, list):
            issues.append({"collection": coll, "index": None, "id": None, "field": None, "message": "Formato non valido (atteso elenco)", "severity": "error"})
            continue
        seen: set = set()
        for idx, d in enumerate(docs):
            validate_doc(coll, idx, d, seen, issues)
    await validate_references({k: v for k, v in body.collections.items() if isinstance(v, list)}, issues)
    return {
        "ok": not any(i["severity"] == "error" for i in issues),
        "errors": sum(1 for i in issues if i["severity"] == "error"),
        "warnings": sum(1 for i in issues if i["severity"] == "warning"),
        "issues": issues[:500],
    }


@api.post("/backup/import")
async def import_backup(body: BackupIn, user: dict = Depends(get_current_user)):
    validate_backup_payload(body.collections)
    handler = replace_collection if body.mode == "replace" else merge_collection
    result = {name: await handler(name, docs) for name, docs in body.collections.items()}
    return {"ok": True, "mode": body.mode, "imported": result}


class WipeIn(BaseModel):
    confirm: str
    include_catalogs: bool = False


OPERATIONAL_COLLECTIONS = ["customers", "parts", "repairs", "sales", "cash_movements", "suppliers", "purchase_orders", "refurbished", "counters"]
CATALOG_COLLECTIONS = ["device_brands", "device_models", "services", "part_templates"]


@api.post("/backup/wipe")
async def wipe_data(body: WipeIn, user: dict = Depends(get_current_user)):
    if body.confirm != "ELIMINA":
        raise HTTPException(400, "Conferma non valida: digita ELIMINA")
    names = OPERATIONAL_COLLECTIONS + (CATALOG_COLLECTIONS if body.include_catalogs else [])
    result = {}
    for name in names:
        r = await db[name].delete_many({})
        result[name] = r.deleted_count
    if body.include_catalogs:
        await seed_device_catalog()
        await seed_services()
        await seed_part_templates()
    return {"ok": True, "deleted": result}


# ---------- Integrity check ----------
def _issue(kind: str, section: str, message: str, fixable: bool, ref: str = None, fix: dict = None) -> dict:
    return {"id": f"{kind}:{ref or new_id()}", "kind": kind, "section": section, "message": message,
            "fixable": fixable, "reference_id": ref, "fix": fix or {}}


async def _check_customers(issues: list, customers: dict):
    for coll, label, sect in (("repairs", "ticket_number", "riparazioni"), ("sales", "invoice_number", "vendite")):
        async for d in db[coll].find({"customer_id": {"$nin": [None, ""]}}):
            c = customers.get(d["customer_id"])
            if not c:
                issues.append(_issue("customer_missing", sect, f"{d[label]}: cliente collegato non esiste più", True, d["id"],
                                     {"coll": coll, "set": {"customer_id": None}}))
            elif c.get("name") != d.get("customer_name"):
                issues.append(_issue("customer_name", sect, f"{d[label]}: nome cliente «{d.get('customer_name')}» ≠ anagrafica «{c['name']}»", True, d["id"],
                                     {"coll": coll, "set": {"customer_name": c["name"]}}))


async def _check_repairs(issues: list, parts: dict):
    async for r in db.repairs.find({}):
        for p in r.get("parts_used", []):
            part = parts.get(p.get("part_id"))
            if p.get("part_id") and not part:
                issues.append(_issue("part_missing", "riparazioni", f"{r['ticket_number']}: ricambio «{p.get('part_name')}» non esiste più in magazzino", False, r["id"]))
            elif part and part.get("name") != p.get("part_name"):
                issues.append(_issue("part_name", "riparazioni", f"{r['ticket_number']}: nome ricambio «{p.get('part_name')}» ≠ magazzino «{part['name']}»", True, r["id"],
                                     {"coll": "repairs", "part_names": True}))
        mov = await db.cash_movements.find_one({"reference_id": r["id"], "category": "riparazione"})
        paid_delivered = r.get("status") == "consegnata" and r.get("paid") and float(r.get("final_price") or 0) > 0
        if paid_delivered and not mov:
            issues.append(_issue("repair_cash_missing", "cassa", f"{r['ticket_number']}: pagata e consegnata ma senza incasso in cassa", True, r["id"], {"sync_cash": True}))
        elif mov and not paid_delivered:
            issues.append(_issue("repair_cash_extra", "cassa", f"{r['ticket_number']}: incasso in cassa ma riparazione non pagata/consegnata", True, r["id"],
                                 {"delete_cash": {"reference_id": r["id"], "category": "riparazione"}}))
        elif mov and abs(float(mov["amount"]) - float(r["final_price"])) > 0.005:
            issues.append(_issue("repair_cash_amount", "cassa", f"{r['ticket_number']}: incasso {mov['amount']:.2f} € ≠ prezzo finale {float(r['final_price']):.2f} €", True, r["id"],
                                 {"update_cash": {"filter": {"id": mov["id"]}, "set": {"amount": float(r["final_price"])}}}))


async def _check_sales(issues: list):
    async for s in db.sales.find({}):
        mov = await db.cash_movements.find_one({"reference_id": s["id"], "category": "vendita"})
        if not mov:
            issues.append(_issue("sale_cash_missing", "cassa", f"{s['invoice_number']}: vendita senza incasso in cassa", True, s["id"], {"sync_cash": True}))
        elif abs(float(mov["amount"]) - float(s["total"])) > 0.005 or mov.get("date") != s["created_at"]:
            issues.append(_issue("sale_cash_mismatch", "cassa", f"{s['invoice_number']}: incasso in cassa non allineato (importo/data)", True, s["id"], {"sync_cash": True}))


async def _check_refurbished(issues: list):
    async for d in db.refurbished.find({}):
        rep = await db.repairs.find_one({"id": d["repair_id"]}) if d.get("repair_id") else None
        if d.get("repair_id") and not rep:
            issues.append(_issue("refurb_repair_missing", "ricondizionati", f"{d['code']}: riparazione collegata non esiste più", True, d["id"],
                                 {"coll": "refurbished", "set": {"repair_id": None}}))
        sale = await db.sales.find_one({"id": d["sale_id"]}) if d.get("sale_id") else None
        if d.get("sale_id") and not sale:
            issues.append(_issue("refurb_sale_missing", "ricondizionati", f"{d['code']}: vendita collegata non esiste più (riportato a «pronto»)", True, d["id"],
                                 {"coll": "refurbished", "set": {"sale_id": None, "status": "pronto", "sale_price": 0.0, "sold_at": None}}))
        elif sale:
            enriched = await enrich_refurb(dict(d))
            if d.get("status") != "venduto":
                issues.append(_issue("refurb_status", "ricondizionati", f"{d['code']}: ha una vendita ma lo stato non è «venduto»", True, d["id"],
                                     {"coll": "refurbished", "set": {"status": "venduto"}}))
            if abs(float(sale["total"]) - float(d.get("sale_price") or 0)) > 0.005 or abs(float(sale.get("cost_total") or 0) - enriched["total_cost"]) > 0.005 \
                    or sale.get("created_at") != d.get("sold_at"):
                issues.append(_issue("refurb_sale_mismatch", "vendite", f"{d['code']} / {sale['invoice_number']}: prezzo, costo o data vendita non allineati", True, d["id"],
                                     {"refurb_sale_sync": True}))
        elif d.get("status") == "venduto":
            issues.append(_issue("refurb_no_sale", "ricondizionati", f"{d['code']}: stato «venduto» ma nessuna vendita collegata", False, d["id"]))
        mov = await db.cash_movements.find_one({"reference_id": d["id"], "category": "acquisto"})
        cost = float(d.get("purchase_cost") or 0)
        if (cost > 0 and not mov) or (mov and (abs(float(mov["amount"]) - cost) > 0.005 or mov.get("date") != d.get("purchase_date"))):
            issues.append(_issue("refurb_purchase_cash", "cassa", f"{d['code']}: uscita di cassa acquisto mancante o non allineata", True, d["id"], {"refurb_purchase_sync": True}))
        for c in d.get("refurb_costs", []):
            cm = await db.cash_movements.find_one({"reference_id": c["id"]})
            if float(c.get("amount") or 0) > 0 and not cm:
                issues.append(_issue("refurb_cost_cash", "cassa", f"{d['code']}: costo «{c['description']}» senza uscita di cassa", True, c["id"],
                                     {"create_cash": {"type": "uscita", "category": "ricondizionamento", "amount": float(c["amount"]),
                                                      "description": f"{d['code']} · {c['description']}", "reference_id": c["id"], "date": c.get("date") or now_iso()}}))
            elif cm and abs(float(cm["amount"]) - float(c.get("amount") or 0)) > 0.005:
                issues.append(_issue("refurb_cost_amount", "cassa", f"{d['code']}: uscita «{c['description']}» {cm['amount']:.2f} € ≠ {float(c['amount']):.2f} €", True, c["id"],
                                     {"update_cash": {"filter": {"id": cm["id"]}, "set": {"amount": float(c["amount"])}}}))


async def _check_orphan_cash(issues: list):
    targets = {"vendita": "sales", "riparazione": "repairs", "acquisto_ricambi": "parts", "acquisto": "refurbished"}
    async for m in db.cash_movements.find({"reference_id": {"$nin": [None, ""]}}):
        coll = targets.get(m.get("category"))
        if coll:
            found = await db[coll].find_one({"id": m["reference_id"]}) or (coll == "refurbished" and await db.purchase_orders.find_one({"id": m["reference_id"]}))
        elif m.get("category") == "ricondizionamento":
            found = await db.refurbished.find_one({"refurb_costs.id": m["reference_id"]})
        else:
            continue
        if not found:
            issues.append(_issue("cash_orphan", "cassa", f"Movimento «{m.get('description') or m['category']}» ({m['amount']:.2f} €) collegato a un documento eliminato", True, m["id"],
                                 {"update_cash": {"filter": {"id": m["id"]}, "set": {"reference_id": None}}}))


async def collect_integrity_issues() -> list:
    issues: list = []
    customers = {c["id"]: c async for c in db.customers.find({})}
    parts = {p["id"]: p async for p in db.parts.find({})}
    await _check_customers(issues, customers)
    await _check_repairs(issues, parts)
    await _check_sales(issues)
    await _check_refurbished(issues)
    await _check_orphan_cash(issues)
    return issues


async def apply_integrity_fix(issue: dict) -> bool:
    fix = issue.get("fix") or {}
    ref = issue.get("reference_id")
    if fix.get("sync_cash"):
        await sync_cash()
    elif fix.get("refurb_sale_sync"):
        d = await db.refurbished.find_one({"id": ref})
        enriched = await enrich_refurb(dict(d))
        price = float(d.get("sale_price") or 0)
        sale = await db.sales.find_one({"id": d["sale_id"]})
        sold_at = d.get("sold_at") or sale["created_at"]
        if not d.get("sold_at"):
            await db.refurbished.update_one({"id": ref}, {"$set": {"sold_at": sold_at}})
        await db.sales.update_one({"id": d["sale_id"]}, {"$set": {"total": price, "items.0.unit_price": price, "cost_total": enriched["total_cost"],
                                                                   "margin": round(price - enriched["total_cost"], 2), "created_at": sold_at}})
        await sync_cash()
    elif fix.get("refurb_purchase_sync"):
        await sync_refurb_purchase_movement(await db.refurbished.find_one({"id": ref}))
    elif fix.get("part_names"):
        r = await db.repairs.find_one({"id": ref})
        for p in r.get("parts_used", []):
            part = await db.parts.find_one({"id": p.get("part_id")})
            if part:
                p["part_name"] = part["name"]
        await db.repairs.update_one({"id": ref}, {"$set": {"parts_used": r["parts_used"]}})
    elif fix.get("delete_cash"):
        await db.cash_movements.delete_many(fix["delete_cash"])
    elif fix.get("update_cash"):
        await db.cash_movements.update_one(fix["update_cash"]["filter"], {"$set": fix["update_cash"]["set"]})
    elif fix.get("create_cash"):
        await db.cash_movements.insert_one(CashMovement(**fix["create_cash"]).model_dump())
    elif fix.get("coll") and fix.get("set"):
        await db[fix["coll"]].update_one({"id": ref}, {"$set": fix["set"]})
    else:
        return False
    return True


@api.get("/integrity/check")
async def integrity_check(user: dict = Depends(get_current_user)):
    issues = await collect_integrity_issues()
    return {"count": len(issues), "fixable": sum(1 for i in issues if i["fixable"]), "issues": issues}


class IntegrityRepairIn(BaseModel):
    issue_ids: Optional[List[str]] = None


@api.post("/integrity/repair")
async def integrity_repair(body: IntegrityRepairIn, user: dict = Depends(get_current_user)):
    issues = await collect_integrity_issues()
    wanted = set(body.issue_ids or [])
    fixed = 0
    for i in issues:
        if i["fixable"] and (not wanted or i["id"] in wanted):
            fixed += 1 if await apply_integrity_fix(i) else 0
    remaining = await collect_integrity_issues()
    return {"fixed": fixed, "remaining": len(remaining), "issues": remaining}


# ---------- Reports / Dashboard ----------
async def sum_cash(match: dict) -> dict:
    cursor = db.cash_movements.aggregate([
        {"$match": match},
        {"$group": {"_id": "$type", "total": {"$sum": "$amount"}}},
    ])
    totals = {"entrata": 0.0, "uscita": 0.0}
    async for row in cursor:
        totals[row["_id"]] = row["total"]
    return totals


def cash_summary(t: dict) -> dict:
    return {
        "entrate": round(t["entrata"], 2),
        "uscite": round(t["uscita"], 2),
        "netto": round(t["entrata"] - t["uscita"], 2),
    }


async def daily_cash_series(now: datetime, days: int = 14) -> list:
    series = []
    for i in range(days - 1, -1, -1):
        day = (now - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        row = await sum_cash({"date": {"$gte": day.isoformat(), "$lt": (day + timedelta(days=1)).isoformat()}})
        series.append({"date": day.strftime("%d/%m"), "entrate": round(row["entrata"], 2), "uscite": round(row["uscita"], 2)})
    return series


async def inventory_stats() -> dict:
    parts = await db.parts.find({}).to_list(2000)
    low_stock = [clean(p) for p in parts if p.get("quantity", 0) <= p.get("min_quantity", 0)]
    return {
        "low_stock_count": len(low_stock),
        "low_stock_items": low_stock[:10],
        "inventory_value": round(sum(p.get("quantity", 0) * p.get("cost_price", 0) for p in parts), 2),
    }


@api.get("/reports/dashboard")
async def dashboard(user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    start_of_month = start_of_day.replace(day=1)
    return {
        "today": cash_summary(await sum_cash({"date": {"$gte": start_of_day.isoformat()}})),
        "month": cash_summary(await sum_cash({"date": {"$gte": start_of_month.isoformat()}})),
        "open_repairs": await db.repairs.count_documents({"status": {"$in": ["in_attesa", "in_lavorazione"]}}),
        "completed_repairs": await db.repairs.count_documents({"status": "completata"}),
        "total_customers": await db.customers.count_documents({}),
        **(await inventory_stats()),
        "daily_series": await daily_cash_series(now),
    }


# ---------- Startup ----------
async def setup_indexes():
    await db.users.create_index("email", unique=True)
    await db.customers.create_index("name")
    await db.parts.create_index("name")
    await db.repairs.create_index("ticket_number")
    await db.sales.create_index("invoice_number")
    await db.cash_movements.create_index("date")
    await db.device_models.create_index("brand")


async def seed_device_catalog():
    if await db.device_brands.count_documents({}) > 0:
        return
    brands, models = [], []
    for brand, items in DEVICE_CATALOG.items():
        brands.append({"id": new_id(), "name": brand, "custom": False, "created_at": now_iso()})
        for name, code in items:
            models.append({"id": new_id(), "brand": brand, "name": name, "code": code, "custom": False, "created_at": now_iso()})
    await db.device_brands.insert_many(brands)
    await db.device_models.insert_many(models)
    logger.info(f"Catalogo dispositivi inizializzato: {len(brands)} marche, {len(models)} modelli")


async def seed_services():
    if await db.services.count_documents({}) > 0:
        return
    await db.services.insert_many([
        Service(name=n, category=c, device_type=t, price=p).model_dump() for n, c, t, p in SERVICE_SEED
    ])
    logger.info("Listino interventi inizializzato")


async def seed_part_templates():
    if await db.part_templates.count_documents({}) > 0:
        return
    await db.part_templates.insert_many([
        {"id": new_id(), "name": n, "category": guess_part_category(n) or "Altro", "custom": False, "created_at": now_iso()}
        for n in PART_TEMPLATE_SEED
    ])
    logger.info("Catalogo ricambi inizializzato")


async def ensure_admin_user():
    admin_email = os.environ["ADMIN_EMAIL"].lower()
    admin_password = os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
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
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})
        logger.info("Password admin aggiornata da .env")


@app.on_event("startup")
async def startup():
    await setup_indexes()
    await seed_device_catalog()
    await seed_services()
    await seed_part_templates()
    await ensure_admin_user()


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
