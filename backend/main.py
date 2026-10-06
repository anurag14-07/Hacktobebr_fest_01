import hashlib
import hmac
import io
import json
import math
import os
import re
import secrets
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv

from ai_provider import generate_educational_answer

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")
DB_PATH = Path(os.getenv("DATABASE_PATH", str(BASE_DIR / "mediguide.db")))
ALLOWED_TYPES = {"application/pdf", "image/jpeg", "image/png"}
MAX_UPLOAD_BYTES = 12 * 1024 * 1024
PBKDF2_ITERATIONS = 210_000
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"

app = FastAPI(title="MediGuide AI API", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@contextmanager
def connection():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    try:
        yield db
        db.commit()
    finally:
        db.close()


def initialize_db() -> None:
    with connection() as db:
        report_cols = [row[1] for row in db.execute("PRAGMA table_info(reports)").fetchall()]
        if report_cols and "user_id" not in report_cols:
            db.execute("DROP TABLE reports")
        db.execute(
            """CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            )"""
        )
        db.execute(
            """CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )"""
        )
        db.execute(
            """CREATE TABLE IF NOT EXISTS reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                content_type TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                extracted_text TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )"""
        )
        db.execute(
            """CREATE TABLE IF NOT EXISTS conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                report_id INTEGER,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(report_id) REFERENCES reports(id) ON DELETE SET NULL
            )"""
        )
        db.execute(
            """CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id INTEGER NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
            )"""
        )


@app.on_event("startup")
def startup() -> None:
    initialize_db()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), PBKDF2_ITERATIONS
    ).hex()
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _algo, iterations, salt, digest = stored.split("$")
        check = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), salt.encode("utf-8"), int(iterations)
        ).hex()
        return hmac.compare_digest(check, digest)
    except ValueError:
        return False


def public_user(row: sqlite3.Row) -> dict[str, Any]:
    return {"id": row["id"], "name": row["name"], "email": row["email"]}


def get_current_user(authorization: str | None = Header(default=None)) -> sqlite3.Row:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Sign in to continue.")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Sign in to continue.")
    with connection() as db:
        row = db.execute(
            """SELECT users.id, users.name, users.email
               FROM sessions JOIN users ON users.id = sessions.user_id
               WHERE sessions.token = ?""",
            (token,),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=401, detail="Your session has expired. Sign in again.")
    return row


class AuthRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=128)
    name: str | None = Field(default=None, min_length=1, max_length=80)


class QuestionRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    conversation_id: int | None = None
    report_id: int | None = None


class AnalysisRequest(BaseModel):
    report_id: int


def normalize_email(email: str) -> str:
    value = email.strip().lower()
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", value):
        raise HTTPException(status_code=422, detail="Enter a valid email address.")
    return value


def create_session(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    with connection() as db:
        db.execute(
            "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
            (token, user_id, now_iso()),
        )
    return token


def fallback_answer() -> dict[str, Any]:
    return {
        "summary": "I can help explain general health information, but I cannot diagnose a condition or determine what a result means for you personally.",
        "explanation": "Lab reference ranges are guides and can vary. A clinician can interpret a result alongside your health history and the reason a test was ordered.",
        "important_points": [
            "Do not start, stop, or change medicines or supplements based on this response.",
            "MediAI provides educational information only.",
        ],
        "suggested_next_step": "Consider asking a qualified healthcare professional any question that is specific to you.",
        "disclaimer": "Educational information only. Not a diagnosis or medical advice.",
    }


def extract_report_text(content_type: str, contents: bytes) -> str:
    if content_type != "application/pdf":
        return ""
    try:
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(contents))
        pages = []
        for page in reader.pages[:12]:
            pages.append(page.extract_text() or "")
        return "\n".join(pages).strip()
    except Exception:
        return ""


def conversation_payload(db: sqlite3.Connection, conversation_id: int, user_id: int) -> dict[str, Any] | None:
    conversation = db.execute(
        "SELECT id, title, report_id, created_at, updated_at FROM conversations WHERE id = ? AND user_id = ?",
        (conversation_id, user_id),
    ).fetchone()
    if conversation is None:
        return None
    rows = db.execute(
        "SELECT id, role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY id ASC",
        (conversation_id,),
    ).fetchall()
    messages = []
    for row in rows:
        item = dict(row)
        if item["role"] == "assistant":
            try:
                item["sections"] = json.loads(item["content"])
            except json.JSONDecodeError:
                item["sections"] = {"summary": item["content"]}
        messages.append(item)
    return {**dict(conversation), "messages": messages}


def haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 3958.8
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return round(2 * radius * math.asin(math.sqrt(a)), 1)


def http_json(url: str, data: bytes | None = None, method: str = "GET") -> Any:
    request = Request(
        url,
        data=data,
        method=method,
        headers={
            "User-Agent": "MediGuideAI/0.2 (educational health MVP)",
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded" if data else "application/json",
        },
    )
    with urlopen(request, timeout=25) as response:
        return json.loads(response.read())


def geocode_place(query: str) -> tuple[float, float, str] | None:
    url = f"{NOMINATIM_URL}?{urlencode({'q': query, 'format': 'json', 'limit': 1})}"
    try:
        results = http_json(url)
    except (HTTPError, URLError, TimeoutError, ValueError):
        return None
    if not results:
        return None
    place = results[0]
    return float(place["lat"]), float(place["lon"]), place.get("display_name", query)


def fetch_nearby_care(lat: float, lon: float) -> list[dict[str, Any]]:
    query = f"""
    [out:json][timeout:20];
    (
      node["amenity"~"hospital|clinic|doctors"](around:8000,{lat},{lon});
      way["amenity"~"hospital|clinic|doctors"](around:8000,{lat},{lon});
    );
    out center 30;
    """
    try:
        payload = http_json(OVERPASS_URL, data=urlencode({"data": query}).encode("utf-8"), method="POST")
    except (HTTPError, URLError, TimeoutError, ValueError):
        raise HTTPException(status_code=502, detail="Could not load nearby care right now. Try again in a moment.")
    colors = ["mint", "peach", "blue"]
    providers = []
    for index, element in enumerate(payload.get("elements", [])):
        tags = element.get("tags") or {}
        name = tags.get("name")
        if not name:
            continue
        if "lat" in element:
            plat, plon = float(element["lat"]), float(element["lon"])
        else:
            center = element.get("center") or {}
            if "lat" not in center:
                continue
            plat, plon = float(center["lat"]), float(center["lon"])
        amenity = tags.get("amenity", "clinic").replace("_", " ").title()
        address_parts = [
            tags.get("addr:housenumber", ""),
            tags.get("addr:street", ""),
            tags.get("addr:city", "") or tags.get("addr:suburb", ""),
        ]
        address = " ".join(part for part in address_parts if part) or tags.get("addr:full") or "Address not listed"
        initials = "".join(part[0] for part in name.split()[:2]).upper()
        providers.append(
            {
                "id": f"{element.get('type', 'n')}-{element.get('id')}",
                "name": name,
                "title": amenity,
                "place": tags.get("operator") or amenity,
                "address": address,
                "distance": haversine_miles(lat, lon, plat, plon),
                "lat": plat,
                "lon": plon,
                "phone": tags.get("phone") or tags.get("contact:phone"),
                "website": tags.get("website") or tags.get("contact:website"),
                "hours": tags.get("opening_hours"),
                "initials": initials or "HC",
                "color": colors[index % 3],
            }
        )
    providers.sort(key=lambda item: item["distance"])
    return providers[:20]


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "MediGuide AI"}


@app.post("/api/auth/register", status_code=201)
def register(request: AuthRequest) -> dict[str, Any]:
    name = (request.name or request.email.split("@")[0]).strip()
    if not name:
        raise HTTPException(status_code=422, detail="Enter your name.")
    email = normalize_email(request.email)
    created_at = now_iso()
    with connection() as db:
        existing = db.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="An account with this email already exists.")
        cursor = db.execute(
            "INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
            (name, email, hash_password(request.password), created_at),
        )
        user_id = cursor.lastrowid
        user = db.execute("SELECT id, name, email FROM users WHERE id = ?", (user_id,)).fetchone()
    return {"token": create_session(user_id), "user": public_user(user)}


@app.post("/api/auth/login")
def login(request: AuthRequest) -> dict[str, Any]:
    email = normalize_email(request.email)
    with connection() as db:
        user = db.execute(
            "SELECT id, name, email, password_hash FROM users WHERE email = ?",
            (email,),
        ).fetchone()
    if user is None or not verify_password(request.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")
    return {"token": create_session(user["id"]), "user": public_user(user)}


@app.post("/api/auth/logout")
def logout(authorization: str | None = Header(default=None)) -> dict[str, str]:
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        with connection() as db:
            db.execute("DELETE FROM sessions WHERE token = ?", (token,))
    return {"status": "signed_out"}


@app.get("/api/auth/me")
def me(user: sqlite3.Row = Depends(get_current_user)) -> dict[str, Any]:
    return public_user(user)


@app.get("/api/reports")
def list_reports(user: sqlite3.Row = Depends(get_current_user)) -> list[dict[str, Any]]:
    with connection() as db:
        rows = db.execute(
            """SELECT id, name, content_type, size_bytes, created_at,
                      CASE WHEN extracted_text IS NULL OR extracted_text = '' THEN 0 ELSE 1 END AS has_text
               FROM reports WHERE user_id = ? ORDER BY id DESC""",
            (user["id"],),
        ).fetchall()
    return [dict(row) for row in rows]


@app.post("/api/reports", status_code=201)
async def upload_report(
    file: UploadFile = File(...),
    user: sqlite3.Row = Depends(get_current_user),
) -> dict[str, Any]:
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail="Upload a PDF, JPG, or PNG report.")
    contents = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Report must be smaller than 12 MB.")
    if not contents:
        raise HTTPException(status_code=400, detail="The selected file is empty.")
    extracted = extract_report_text(file.content_type, contents)
    created_at = now_iso()
    with connection() as db:
        cursor = db.execute(
            """INSERT INTO reports (user_id, name, content_type, size_bytes, extracted_text, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (user["id"], file.filename or "Medical report", file.content_type, len(contents), extracted, created_at),
        )
        report_id = cursor.lastrowid
    return {
        "id": report_id,
        "name": file.filename or "Medical report",
        "content_type": file.content_type,
        "size_bytes": len(contents),
        "created_at": created_at,
        "has_text": bool(extracted),
        "status": "ready",
    }


@app.post("/api/analyze")
def analyze_report(request: AnalysisRequest, user: sqlite3.Row = Depends(get_current_user)) -> dict[str, Any]:
    with connection() as db:
        report = db.execute(
            "SELECT id, name, content_type, size_bytes, extracted_text, created_at FROM reports WHERE id = ? AND user_id = ?",
            (request.report_id, user["id"]),
        ).fetchone()
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found.")
    excerpt = (report["extracted_text"] or "").strip()
    if excerpt:
        answer = generate_educational_answer(
            "Summarize this medical report in everyday language. Do not invent values that are not present.",
            report_excerpt=excerpt,
        )
        sections = answer or fallback_answer()
        return {
            "mode": "gemma" if answer else "fallback",
            "report": {
                "id": report["id"],
                "name": report["name"],
                "content_type": report["content_type"],
                "size_bytes": report["size_bytes"],
                "created_at": report["created_at"],
                "has_text": True,
            },
            "summary": sections["summary"],
            "explanation": sections["explanation"],
            "important_points": sections["important_points"],
            "suggested_next_step": sections["suggested_next_step"],
            "disclaimer": sections.get("disclaimer") or fallback_answer()["disclaimer"],
            "values": [],
        }
    return {
        "mode": "unparsed",
        "report": {
            "id": report["id"],
            "name": report["name"],
            "content_type": report["content_type"],
            "size_bytes": report["size_bytes"],
            "created_at": report["created_at"],
            "has_text": False,
        },
        "summary": "This file is saved in your account. Readable text could not be extracted automatically, so MediAI cannot list lab values from it yet.",
        "explanation": "PDF text extraction works best with text-based reports. Scanned images may need to be discussed with a clinician, or you can describe a result in chat.",
        "important_points": [
            "No lab values were invented for this report.",
            "You can still ask MediAI general questions about terms you see on the document.",
        ],
        "suggested_next_step": "Bring the original report to a qualified healthcare professional for personal interpretation.",
        "disclaimer": fallback_answer()["disclaimer"],
        "values": [],
    }


@app.get("/api/conversations")
def list_conversations(user: sqlite3.Row = Depends(get_current_user)) -> list[dict[str, Any]]:
    with connection() as db:
        rows = db.execute(
            """SELECT id, title, report_id, created_at, updated_at
               FROM conversations WHERE user_id = ? ORDER BY updated_at DESC""",
            (user["id"],),
        ).fetchall()
    return [dict(row) for row in rows]


@app.get("/api/conversations/{conversation_id}")
def get_conversation(conversation_id: int, user: sqlite3.Row = Depends(get_current_user)) -> dict[str, Any]:
    with connection() as db:
        payload = conversation_payload(db, conversation_id, user["id"])
    if payload is None:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return payload


@app.post("/api/chat")
def chat(request: QuestionRequest, user: sqlite3.Row = Depends(get_current_user)) -> dict[str, Any]:
    question = request.question.strip()
    if not question:
        raise HTTPException(status_code=422, detail="Enter a question to continue.")
    created_at = now_iso()
    with connection() as db:
        report_excerpt = None
        report_id = request.report_id
        if report_id is not None:
            report = db.execute(
                "SELECT extracted_text FROM reports WHERE id = ? AND user_id = ?",
                (report_id, user["id"]),
            ).fetchone()
            if report is None:
                raise HTTPException(status_code=404, detail="Report not found.")
            report_excerpt = report["extracted_text"]
        conversation_id = request.conversation_id
        if conversation_id is None:
            title = question[:72] + ("…" if len(question) > 72 else "")
            cursor = db.execute(
                """INSERT INTO conversations (user_id, title, report_id, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?)""",
                (user["id"], title, report_id, created_at, created_at),
            )
            conversation_id = cursor.lastrowid
        else:
            owned = db.execute(
                "SELECT id FROM conversations WHERE id = ? AND user_id = ?",
                (conversation_id, user["id"]),
            ).fetchone()
            if owned is None:
                raise HTTPException(status_code=404, detail="Conversation not found.")
        prior = db.execute(
            "SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id ASC",
            (conversation_id,),
        ).fetchall()
        history = []
        for row in prior:
            content = row["content"]
            if row["role"] == "assistant":
                try:
                    sections = json.loads(content)
                    content = sections.get("summary") or content
                except json.JSONDecodeError:
                    pass
            history.append({"role": row["role"], "content": content})
        db.execute(
            "INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)",
            (conversation_id, "user", question, created_at),
        )
        answer = generate_educational_answer(question, history=history, report_excerpt=report_excerpt)
        sections = answer or fallback_answer()
        db.execute(
            "INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)",
            (conversation_id, "assistant", json.dumps(sections), now_iso()),
        )
        db.execute(
            "UPDATE conversations SET updated_at = ?, report_id = COALESCE(?, report_id) WHERE id = ?",
            (now_iso(), report_id, conversation_id),
        )
        payload = conversation_payload(db, conversation_id, user["id"])
    return {
        "mode": "gemma" if answer else "fallback",
        "conversation": payload,
        "disclaimer": sections.get("disclaimer") or fallback_answer()["disclaimer"],
    }


@app.get("/api/providers")
def list_providers(lat: float | None = None, lon: float | None = None, q: str | None = None) -> dict[str, Any]:
    label = "Current location"
    if (lat is None or lon is None) and q:
        located = geocode_place(q)
        if located is None:
            raise HTTPException(status_code=404, detail="Could not find that place. Try a city or postal code.")
        lat, lon, label = located
    if lat is None or lon is None:
        return {"location": None, "providers": []}
    return {
        "location": {"lat": lat, "lon": lon, "label": label},
        "providers": fetch_nearby_care(lat, lon),
    }
