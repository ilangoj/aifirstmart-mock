"""Products, images and inventory. Channels only ever see availability: on hand - buffer - reserved.
With a database path, products and images are stored in SQLite and survive restarts; changes saved
together are applied in one transaction (all or nothing)."""
from __future__ import annotations
import base64, io, json, secrets, sqlite3, time
from dataclasses import dataclass, field


@dataclass
class Product:
    sku: str
    tenant_id: str
    name: str
    price_paise: int
    gtin: str | None = None
    brand: str | None = None
    channel_ids: dict = field(default_factory=dict)   # e.g. {"amazon": "ASIN...", "flipkart": "FSN..."}
    category: str = "Grocery"


class CatalogError(Exception):
    pass


IMAGE_TYPES = {"image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WEBP"}
IMAGE_ROLES = {"Front", "Back", "Ingredients", "Nutrition", "Other"}
MAX_IMAGE_BYTES, MIN_IMAGE_PX, MAX_IMAGES = 5 * 1024 * 1024, 500, 6


def check_image(content_type: str, data: bytes) -> tuple[int, int]:
    """Return (width, height) or raise CatalogError. The bytes must really be the declared image type."""
    from PIL import Image                       # Pillow
    if content_type not in IMAGE_TYPES:
        raise CatalogError("Use a JPG, PNG or WebP image")
    if len(data) > MAX_IMAGE_BYTES:
        raise CatalogError("Image is larger than 5 MB")
    try:
        im = Image.open(io.BytesIO(data)); im.verify()
        im = Image.open(io.BytesIO(data))
    except Exception as e:
        raise CatalogError("The file is not a readable image") from e
    if im.format != IMAGE_TYPES[content_type]:
        raise CatalogError("The file content does not match its image type")
    w, h = im.size
    if w < MIN_IMAGE_PX or h < MIN_IMAGE_PX:
        raise CatalogError(f"{w} × {h} pixels is too small; use at least {MIN_IMAGE_PX} × {MIN_IMAGE_PX}")
    return w, h


@dataclass
class StockLevel:
    on_hand: int = 0
    reserved: int = 0
    buffer: int = 0

    @property
    def available(self) -> int:
        return max(0, self.on_hand - self.buffer - self.reserved)


class Catalog:
    def __init__(self, db_path: str | None = None):
        self.products: dict[tuple[str, str], Product] = {}
        self.stock: dict[tuple[str, str, str], StockLevel] = {}     # (tenant, location, sku)
        self.images: dict[tuple[str, str], list[dict]] = {}
        self.db = sqlite3.connect(db_path, check_same_thread=False) if db_path else None
        if self.db:
            self.db.executescript("""
              CREATE TABLE IF NOT EXISTS products (tenant TEXT, sku TEXT, name TEXT, price_paise INTEGER, gtin TEXT, brand TEXT,
                category TEXT, channel_ids TEXT, updated REAL, PRIMARY KEY (tenant, sku));
              CREATE TABLE IF NOT EXISTS product_images (id TEXT PRIMARY KEY, tenant TEXT, sku TEXT, role TEXT, main INTEGER,
                width INTEGER, height INTEGER, content_type TEXT, data BLOB, created REAL);""")
            for t, sku, n, pr, g, br, cat, ch, _ in self.db.execute("SELECT * FROM products"):
                self.products[(t, sku)] = Product(sku, t, n, pr, g, br, json.loads(ch or "{}"), cat)
            for i, t, sku, role, main, w, h, ct, data, cr in self.db.execute("SELECT * FROM product_images ORDER BY created"):
                self.images.setdefault((t, sku), []).append({"id": i, "role": role, "main": bool(main), "width": w, "height": h, "content_type": ct, "data": data})

    def _write_product(self, p: Product) -> None:
        if self.db:
            self.db.execute("INSERT OR REPLACE INTO products VALUES (?,?,?,?,?,?,?,?,?)",
                            (p.tenant_id, p.sku, p.name, p.price_paise, p.gtin, p.brand, p.category, json.dumps(p.channel_ids), time.time()))

    def upsert(self, p: Product) -> Product:
        self.products[(p.tenant_id, p.sku)] = p
        self._write_product(p)
        if self.db:
            self.db.commit()
        return p

    def images_of(self, tenant_id: str, sku: str) -> list[dict]:
        return self.images.get((tenant_id, sku), [])

    def apply_changes(self, tenant_id: str, prices: dict[str, int], images: list[dict]) -> dict:
        """Validate everything first, then apply prices and images in one transaction."""
        for sku, paise in prices.items():
            if (tenant_id, sku) not in self.products:
                raise CatalogError(f"Unknown product {sku}")
            if not isinstance(paise, int) or paise <= 0:
                raise CatalogError(f"Price for {sku} must be a whole number of paise above 0")
        prepared = []
        counts = {sku: len(self.images_of(tenant_id, sku)) for sku in {i.get("sku") for i in images}}
        for i in images:
            sku = i.get("sku")
            if (tenant_id, sku) not in self.products:
                raise CatalogError(f"Unknown product {sku}")
            role = i.get("role") or "Other"
            if role not in IMAGE_ROLES:
                raise CatalogError(f"Unknown image type {role}")
            try:
                data = base64.b64decode(i.get("data_base64") or "", validate=True)
            except Exception as e:
                raise CatalogError("Image data is not valid base64") from e
            w, h = check_image(i.get("content_type", ""), data)
            counts[sku] += 1
            if counts[sku] > MAX_IMAGES:
                raise CatalogError(f"{sku} would have more than {MAX_IMAGES} images")
            prepared.append((sku, {"id": "img_" + secrets.token_hex(6), "role": role, "width": w, "height": h, "content_type": i["content_type"], "data": data}))
        before = {}
        try:
            for sku, paise in prices.items():
                p = self.products[(tenant_id, sku)]; before[sku] = p.price_paise; p.price_paise = paise; self._write_product(p)
            for sku, rec in prepared:
                lst = self.images.setdefault((tenant_id, sku), [])
                rec["main"] = not any(x["main"] for x in lst)
                lst.append(rec)
                if self.db:
                    self.db.execute("INSERT INTO product_images VALUES (?,?,?,?,?,?,?,?,?,?)", (rec["id"], tenant_id, sku, rec["role"], int(rec["main"]),
                                    rec["width"], rec["height"], rec["content_type"], rec["data"], time.time()))
            if self.db:
                self.db.commit()
        except Exception:
            if self.db:
                self.db.rollback()
            for sku, paise in before.items():
                self.products[(tenant_id, sku)].price_paise = paise
            for sku, rec in prepared:
                lst = self.images.get((tenant_id, sku), [])
                if rec in lst:
                    lst.remove(rec)
            raise
        return {"prices_changed": len(prices), "images_added": len(prepared), "image_ids": [r["id"] for _, r in prepared]}

    def products_of(self, tenant_id: str) -> list[Product]:
        return [p for (t, _), p in self.products.items() if t == tenant_id]

    def set_stock(self, tenant_id: str, location_id: str, sku: str, on_hand: int, buffer: int = 0) -> StockLevel:
        lvl = self.stock.setdefault((tenant_id, location_id, sku), StockLevel())
        lvl.on_hand, lvl.buffer = on_hand, buffer
        return lvl

    def availability(self, tenant_id: str, locations: list[str] | None = None) -> list[dict]:
        out = []
        for (t, loc, sku), lvl in self.stock.items():
            if t == tenant_id and (not locations or loc in locations):
                out.append({"sku": sku, "location_id": loc, "available": lvl.available})
        return out

    def reserve(self, tenant_id: str, sku: str, qty: int) -> str | None:
        """Reserve at the first location that can cover the quantity; return the location id."""
        for (t, loc, s), lvl in self.stock.items():
            if t == tenant_id and s == sku and lvl.available >= qty:
                lvl.reserved += qty
                return loc
        return None
