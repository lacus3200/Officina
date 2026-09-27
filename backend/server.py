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


RepairStatus = Literal["in_attesa", "in_lavorazione", "completata", "consegnata", "annullata"]


class RepairPartUsed(BaseModel):
    part_id: str
    part_name: str
    quantity: int = 1
    unit_price: float = 0.0


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


class RefurbCostIn(BaseModel):
    description: str
    amount: float = 0.0


class RefurbSellIn(BaseModel):
    sale_price: float
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    payment_method: str = "contanti"
    notes: Optional[str] = None


class BrandIn(BaseModel):
    name: str


class ColorIn(BaseModel):
    color: str


class PartTemplateIn(BaseModel):
    name: str
    category: Optional[str] = None


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
    if not obj.category:
        obj.category = guess_part_category(obj.name)
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
    if not obj.received_at:
        obj.received_at = obj.created_at
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
async def delete_refurbished(ref_id: str, user: dict = Depends(get_current_user)):
    existing = await db.refurbished.find_one({"id": ref_id})
    if existing:
        ids = [ref_id] + [c["id"] for c in existing.get("refurb_costs", [])]
        await db.cash_movements.delete_many({"reference_id": {"$in": ids}})
    await db.refurbished.delete_one({"id": ref_id})
    return {"ok": True}


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
    return {"type": None, "data": None}


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
    await db.device_models.create_index("brand")

    if await db.device_brands.count_documents({}) == 0:
        brands, models = [], []
        for brand, items in DEVICE_CATALOG.items():
            brands.append({"id": new_id(), "name": brand, "custom": False, "created_at": now_iso()})
            for name, code in items:
                models.append({"id": new_id(), "brand": brand, "name": name, "code": code, "custom": False, "created_at": now_iso()})
        await db.device_brands.insert_many(brands)
        await db.device_models.insert_many(models)
        logger.info(f"Catalogo dispositivi inizializzato: {len(brands)} marche, {len(models)} modelli")

    if await db.services.count_documents({}) == 0:
        await db.services.insert_many([
            Service(name=n, category=c, device_type=t, price=p).model_dump() for n, c, t, p in SERVICE_SEED
        ])
        logger.info("Listino interventi inizializzato")

    if await db.part_templates.count_documents({}) == 0:
        await db.part_templates.insert_many([
            {"id": new_id(), "name": n, "category": guess_part_category(n) or "Altro", "custom": False, "created_at": now_iso()}
            for n in PART_TEMPLATE_SEED
        ])
        logger.info("Catalogo ricambi inizializzato")

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
