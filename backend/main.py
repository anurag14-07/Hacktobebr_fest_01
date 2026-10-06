import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.getenv("DATABASE_PATH", str(BASE_DIR / "mediguide.db")))
ALLOWED_TYPES = {"application/pdf", "image/jpeg", "image/png"}
MAX_UPLOAD_BYTES = 12 * 1024 * 1024

app = FastAPI(title="MediGuide AI API", version="0.1.0")
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
    try:
        yield db
        db.commit()
    finally:
        db.close()


def initialize_db() -> None:
    with connection() as db:
        db.execute(
            """CREATE TABLE IF NOT EXISTS reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                content_type TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                created_at TEXT NOT NULL
            )"""
        )


@app.on_event("startup")
def startup() -> None:
    initialize_db()


class QuestionRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    report_id: int | None = None


class AnalysisRequest(BaseModel):
    report_id: int | None = None


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "MediGuide AI"}


@app.get("/api/reports")
def list_reports() -> list[dict[str, Any]]:
    with connection() as db:
        rows = db.execute(
            "SELECT id, name, content_type, size_bytes, created_at FROM reports ORDER BY id DESC"
        ).fetchall()
    return [dict(row) for row in rows]


@app.post("/api/reports", status_code=201)
async def upload_report(file: UploadFile = File(...)) -> dict[str, Any]:
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail="Upload a PDF, JPG, or PNG report.")
    contents = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Report must be smaller than 12 MB.")
    if not contents:
        raise HTTPException(status_code=400, detail="The selected file is empty.")
    created_at = datetime.now(timezone.utc).isoformat()
    with connection() as db:
        cursor = db.execute(
            "INSERT INTO reports (name, content_type, size_bytes, created_at) VALUES (?, ?, ?, ?)",
            (file.filename or "Medical report", file.content_type, len(contents), created_at),
        )
        report_id = cursor.lastrowid
    return {
        "id": report_id,
        "name": file.filename or "Medical report",
        "content_type": file.content_type,
        "size_bytes": len(contents),
        "created_at": created_at,
        "status": "metadata_saved",
        "notice": "This MVP stores file metadata only. Configure secure object storage before accepting real health documents.",
    }


@app.post("/api/analyze")
def analyze_report(request: AnalysisRequest) -> dict[str, Any]:
    report = None
    if request.report_id is not None:
        with connection() as db:
            report = db.execute(
                "SELECT id, name, content_type, created_at FROM reports WHERE id = ?",
                (request.report_id,),
            ).fetchone()
        if report is None:
            raise HTTPException(status_code=404, detail="Report not found.")
    return {
        "mode": "demo",
        "report": dict(report) if report else None,
        "summary": "The sample blood panel includes four common measurements. Three are within the reference ranges shown by the lab. One result, Vitamin D, is a little below the listed range.",
        "values": [
            {"name": "Hemoglobin", "value": "13.8", "unit": "g/dL", "reference_range": "12.0–16.0", "status": "in_range"},
            {"name": "Vitamin D", "value": "24", "unit": "ng/mL", "reference_range": "30–100", "status": "below_range"},
            {"name": "Total cholesterol", "value": "186", "unit": "mg/dL", "reference_range": "< 200", "status": "in_range"},
            {"name": "Fasting glucose", "value": "91", "unit": "mg/dL", "reference_range": "70–99", "status": "in_range"},
        ],
        "suggested_next_step": "Consider asking a healthcare professional whether this result needs follow-up for you.",
        "disclaimer": "Educational information only. Not a diagnosis or medical advice.",
    }


@app.post("/api/chat")
def chat(request: QuestionRequest) -> dict[str, Any]:
    question = request.question.strip()
    if not question:
        raise HTTPException(status_code=422, detail="Enter a question to continue.")
    # This MVP uses a clearly labeled fallback until a reviewed Gemma integration is configured.
    configured = bool(os.getenv("GEMMA_API_URL") and os.getenv("GEMMA_API_KEY"))
    return {
        "mode": "demo" if not configured else "provider_not_implemented",
        "question": question,
        "sections": {
            "summary": "I can help explain general health information, but I cannot diagnose a condition or determine what a result means for you personally.",
            "explanation": "Lab reference ranges are guides and can vary. A clinician can interpret a result alongside your health history and the reason the test was ordered.",
            "important_points": ["Do not start, stop, or change medicines or supplements based on this response.", "The included sample report and values are fictional."],
            "suggested_next_step": "Consider asking a qualified healthcare professional: 'Does this result need follow-up for me?'",
        },
        "disclaimer": "Educational information only. Not a diagnosis or medical advice.",
    }


@app.get("/api/providers")
def list_providers() -> list[dict[str, Any]]:
    return [
        {"name": "Dr. Maya Chen", "specialty": "Primary care · Internal medicine", "clinic": "Harbor Health Clinic", "distance_miles": 0.8, "rating": 4.9, "availability": "Today, 2:30 PM", "demo": True},
        {"name": "Dr. Noah Patel", "specialty": "Family medicine", "clinic": "Juniper Medical Group", "distance_miles": 1.4, "rating": 4.8, "availability": "Tomorrow, 9:15 AM", "demo": True},
        {"name": "Northside Community Hospital", "specialty": "Primary care · Urgent care", "clinic": "Northside Health Network", "distance_miles": 2.1, "rating": 4.7, "availability": "Open until 8:00 PM", "demo": True},
    ]
