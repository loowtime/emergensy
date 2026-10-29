import hashlib
import json
import os
import secrets
import sqlite3
import ssl
import time
from contextlib import closing
from ipaddress import ip_address
from pathlib import Path
from typing import Literal
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import Request as URLRequest, urlopen

import certifi
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI()
DATABASE_PATH = Path(__file__).with_name("riskpilot.db")
ADMIN_USERNAME = os.getenv("RISKPILOT_ADMIN_USER", "admin")
ADMIN_PASSWORD = os.getenv("RISKPILOT_ADMIN_PASSWORD", "admin")
SESSION_TTL_SECONDS = 8 * 60 * 60
LOGIN_WINDOW_SECONDS = 15 * 60
LOGIN_LOCK_SECONDS = 15 * 60
MAX_LOGIN_ATTEMPTS = 5
HAMBURG_BOUNDS = (53.39, 53.75, 9.73, 10.33)
active_sessions: dict[str, float] = {}
geocode_cache: dict[str, tuple[float, list[dict[str, str | float]]]] = {}


def get_connection():
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database():
    with closing(get_connection()) as connection:
        connection.execute(
            """CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                category TEXT NOT NULL,
                severity TEXT NOT NULL,
                location TEXT NOT NULL,
                description TEXT NOT NULL,
                owner TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'open',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )"""
        )
        columns = {row["name"] for row in connection.execute("PRAGMA table_info(events)")}
        if "latitude" not in columns:
            connection.execute("ALTER TABLE events ADD COLUMN latitude REAL")
        if "longitude" not in columns:
            connection.execute("ALTER TABLE events ADD COLUMN longitude REAL")
        connection.execute(
            """CREATE TABLE IF NOT EXISTS login_attempts (
                client_key TEXT PRIMARY KEY,
                attempts INTEGER NOT NULL,
                window_started_at REAL NOT NULL,
                locked_until REAL NOT NULL DEFAULT 0
            )"""
        )
        connection.commit()


initialize_database()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


class EventCreate(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    category: Literal["Brand", "Verkehr", "Infrastruktur", "Wetter", "Sonstiges"]
    severity: Literal["critical", "warning", "info"]
    location: str = Field(min_length=5, max_length=240)
    latitude: float = Field(ge=HAMBURG_BOUNDS[0], le=HAMBURG_BOUNDS[1])
    longitude: float = Field(ge=HAMBURG_BOUNDS[2], le=HAMBURG_BOUNDS[3])
    description: str = Field(min_length=5, max_length=1200)
    owner: str = Field(min_length=2, max_length=80)


class EventStatusUpdate(BaseModel):
    status: Literal["open", "monitoring", "resolved"]


def serialize_event(row: sqlite3.Row):
    return dict(row)


@app.get("/api/events")
def list_events():
    with closing(get_connection()) as connection:
        rows = connection.execute(
            "SELECT * FROM events ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, created_at DESC"
        ).fetchall()
    return [serialize_event(row) for row in rows]


@app.post("/api/events", status_code=201)
def create_event(event: EventCreate):
    with closing(get_connection()) as connection:
        cursor = connection.execute(
            "INSERT INTO events (title, category, severity, location, description, owner) VALUES (?, ?, ?, ?, ?, ?)",
            (event.title, event.category, event.severity, event.location, event.description, event.owner),
        )
        connection.commit()
        row = connection.execute("SELECT * FROM events WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return serialize_event(row)


@app.patch("/api/events/{event_id}")
def update_event_status(event_id: int, update: EventStatusUpdate):
    with closing(get_connection()) as connection:
        cursor = connection.execute("UPDATE events SET status = ? WHERE id = ?", (update.status, event_id))
        connection.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Ereignis nicht gefunden")
        row = connection.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    return serialize_event(row)

@app.get("/")
def home():
    return {"message": "RiskPilot läuft!"}