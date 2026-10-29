import hashlib
import json
import os
import re
import secrets
import sqlite3
import ssl
import time
from contextlib import closing
from datetime import date, datetime, timezone
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
        connection.execute(
            """CREATE TABLE IF NOT EXISTS situation_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                entry_type TEXT NOT NULL,
                content TEXT NOT NULL,
                author TEXT NOT NULL,
                event_id INTEGER,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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


class AdminLogin(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=200)


class SituationLogCreate(BaseModel):
    entry_type: Literal["observation", "decision", "measure", "resource", "handover"]
    content: str = Field(min_length=1, max_length=1200)
    author: str = Field(min_length=1, max_length=80)
    event_id: int | None = Field(default=None, ge=1)


def serialize_event(row: sqlite3.Row):
    return dict(row)


def request_client_key(request: Request) -> str:
    host = request.client.host if request.client else "unknown"
    return hashlib.sha256(host.encode("utf-8")).hexdigest()


def require_local_client(request: Request):
    host = request.client.host if request.client else ""
    try:
        is_loopback = ip_address(host).is_loopback
    except ValueError:
        is_loopback = False
    if not is_loopback:
        raise HTTPException(status_code=403, detail="Demo-Login ist nur lokal verfügbar")


def require_admin(
    request: Request,
    authorization: str | None = Header(default=None),
) -> str:
    require_local_client(request)
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Anmeldung erforderlich")
    expires_at = active_sessions.get(token)
    if expires_at is None or expires_at <= time.monotonic():
        active_sessions.pop(token, None)
        raise HTTPException(status_code=401, detail="Sitzung abgelaufen")
    return token


@app.post("/api/auth/login")
def login_admin(credentials: AdminLogin, request: Request):
    require_local_client(request)
    now = time.time()
    client_key = request_client_key(request)
    with closing(get_connection()) as connection:
        connection.execute("BEGIN IMMEDIATE")
        attempt = connection.execute(
            "SELECT attempts, window_started_at, locked_until FROM login_attempts WHERE client_key = ?",
            (client_key,),
        ).fetchone()
        connection.execute(
            "DELETE FROM login_attempts WHERE window_started_at < ? AND locked_until <= ?",
            (now - LOGIN_WINDOW_SECONDS, now),
        )
        if attempt and attempt["locked_until"] > now:
            retry_after = int(attempt["locked_until"] - now) + 1
            connection.rollback()
            raise HTTPException(
                status_code=429,
                detail="Zu viele Anmeldeversuche. Bitte später erneut versuchen.",
                headers={"Retry-After": str(retry_after)},
            )

        username_matches = secrets.compare_digest(
            credentials.username.encode("utf-8"), ADMIN_USERNAME.encode("utf-8")
        )
        password_matches = secrets.compare_digest(
            credentials.password.encode("utf-8"), ADMIN_PASSWORD.encode("utf-8")
        )
        valid_credentials = username_matches & password_matches
        if not valid_credentials:
            if attempt and now - attempt["window_started_at"] < LOGIN_WINDOW_SECONDS:
                attempts = attempt["attempts"] + 1
                window_started_at = attempt["window_started_at"]
            else:
                attempts = 1
                window_started_at = now
            locked_until = now + LOGIN_LOCK_SECONDS if attempts >= MAX_LOGIN_ATTEMPTS else 0
            connection.execute(
                """INSERT INTO login_attempts (client_key, attempts, window_started_at, locked_until)
                   VALUES (?, ?, ?, ?)
                   ON CONFLICT(client_key) DO UPDATE SET
                       attempts = excluded.attempts,
                       window_started_at = excluded.window_started_at,
                       locked_until = excluded.locked_until""",
                (client_key, attempts, window_started_at, locked_until),
            )
            connection.commit()
            if locked_until:
                raise HTTPException(
                    status_code=429,
                    detail="Zu viele Anmeldeversuche. Anmeldung ist 15 Minuten gesperrt.",
                    headers={"Retry-After": str(LOGIN_LOCK_SECONDS)},
                )
            raise HTTPException(status_code=401, detail="Benutzername oder Passwort falsch")
        connection.execute("DELETE FROM login_attempts WHERE client_key = ?", (client_key,))
        connection.commit()

    now = time.monotonic()
    expired_tokens = [token for token, expiry in active_sessions.items() if expiry <= now]
    for token in expired_tokens:
        del active_sessions[token]
    access_token = secrets.token_urlsafe(32)
    active_sessions[access_token] = now + SESSION_TTL_SECONDS
    return {"access_token": access_token, "token_type": "bearer"}


@app.post("/api/auth/logout")
def logout_admin(token: str = Depends(require_admin)):
    active_sessions.pop(token, None)
    return {"message": "Abgemeldet"}


@app.get("/api/events")
def list_events(_: str = Depends(require_admin)):
    with closing(get_connection()) as connection:
        rows = connection.execute(
            "SELECT * FROM events ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, created_at DESC"
        ).fetchall()
    return [serialize_event(row) for row in rows]


@app.post("/api/events", status_code=201)
def create_event(event: EventCreate, _: str = Depends(require_admin)):
    with closing(get_connection()) as connection:
        cursor = connection.execute(
            "INSERT INTO events (title, category, severity, location, latitude, longitude, description, owner) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (event.title, event.category, event.severity, event.location, event.latitude, event.longitude, event.description, event.owner),
        )
        connection.commit()
        row = connection.execute("SELECT * FROM events WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return serialize_event(row)


@app.patch("/api/events/{event_id}")
def update_event_status(event_id: int, update: EventStatusUpdate, _: str = Depends(require_admin)):
    with closing(get_connection()) as connection:
        cursor = connection.execute("UPDATE events SET status = ? WHERE id = ?", (update.status, event_id))
        connection.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Ereignis nicht gefunden")
        row = connection.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    return serialize_event(row)


@app.delete("/api/events/{event_id}", status_code=204)
def delete_event(event_id: int, _: str = Depends(require_admin)):
    with closing(get_connection()) as connection:
        cursor = connection.execute("DELETE FROM events WHERE id = ?", (event_id,))
        connection.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Ereignis nicht gefunden")
    return Response(status_code=204)


def situation_log_filters(
    entry_type: Literal["observation", "decision", "measure", "resource", "handover"] | None,
    event_id: int | None,
    from_date: date | None,
    to_date: date | None,
    q: str | None,
) -> tuple[str, list[str | int]]:
    if from_date and to_date and from_date > to_date:
        raise HTTPException(status_code=422, detail="Startdatum muss vor dem Enddatum liegen")

    conditions: list[str] = []
    parameters: list[str | int] = []
    if entry_type:
        conditions.append("s.entry_type = ?")
        parameters.append(entry_type)
    if event_id is not None:
        conditions.append("s.event_id = ?")
        parameters.append(event_id)
    if from_date:
        conditions.append("date(s.created_at) >= ?")
        parameters.append(from_date.isoformat())
    if to_date:
        conditions.append("date(s.created_at) <= ?")
        parameters.append(to_date.isoformat())
    if q and q.strip():
        conditions.append("(s.content LIKE ? OR s.author LIKE ? OR e.title LIKE ?)")
        search = f"%{q.strip()}%"
        parameters.extend((search, search, search))

    where_clause = f" WHERE {' AND '.join(conditions)}" if conditions else ""
    return where_clause, parameters


@app.get("/api/situation-log")
def list_situation_log(
    entry_type: Literal["observation", "decision", "measure", "resource", "handover"] | None = None,
    event_id: int | None = Query(default=None, ge=1),
    from_date: date | None = None,
    to_date: date | None = None,
    q: str | None = Query(default=None, max_length=120),
    offset: int = Query(default=0, ge=0, le=1_000_000),
    limit: int = Query(default=50, ge=1, le=200),
    _: str = Depends(require_admin),
):
    where_clause, parameters = situation_log_filters(entry_type, event_id, from_date, to_date, q)
    with closing(get_connection()) as connection:
        total = connection.execute(
            f"SELECT COUNT(*) FROM situation_log s LEFT JOIN events e ON e.id = s.event_id{where_clause}",
            parameters,
        ).fetchone()[0]
        rows = connection.execute(
            f"""SELECT s.*, e.title AS event_title
                FROM situation_log s
                LEFT JOIN events e ON e.id = s.event_id
                {where_clause}
                ORDER BY s.id DESC
                LIMIT ? OFFSET ?""",
            [*parameters, limit, offset],
        ).fetchall()
    return {"entries": [dict(row) for row in rows], "total": total, "offset": offset, "limit": limit}


@app.get("/api/situation-log/report")
def generate_situation_log_report(
    entry_type: Literal["observation", "decision", "measure", "resource", "handover"] | None = None,
    event_id: int | None = Query(default=None, ge=1),
    from_date: date | None = None,
    to_date: date | None = None,
    q: str | None = Query(default=None, max_length=120),
    _: str = Depends(require_admin),
):
    where_clause, parameters = situation_log_filters(entry_type, event_id, from_date, to_date, q)
    with closing(get_connection()) as connection:
        rows = connection.execute(
            f"""SELECT s.*, e.title AS event_title
                FROM situation_log s
                LEFT JOIN events e ON e.id = s.event_id
                {where_clause}
                ORDER BY s.id ASC""",
            parameters,
        ).fetchall()
    entries = [dict(row) for row in rows]
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "total": len(entries),
        "entries": entries,
    }


@app.post("/api/situation-log", status_code=201)
def create_situation_log_entry(entry: SituationLogCreate, _: str = Depends(require_admin)):
    content = entry.content.strip()
    author = entry.author.strip()
    if not content or not author:
        raise HTTPException(status_code=422, detail="Eintrag und Kürzel dürfen nicht leer sein")

    with closing(get_connection()) as connection:
        if entry.event_id is not None:
            event = connection.execute(
                "SELECT 1 FROM events WHERE id = ?", (entry.event_id,)
            ).fetchone()
            if event is None:
                raise HTTPException(status_code=404, detail="Verknüpftes Ereignis nicht gefunden")
        cursor = connection.execute(
            "INSERT INTO situation_log (entry_type, content, author, event_id) VALUES (?, ?, ?, ?)",
            (entry.entry_type, content, author, entry.event_id),
        )
        connection.commit()
        row = connection.execute(
            """SELECT s.*, e.title AS event_title
               FROM situation_log s
               LEFT JOIN events e ON e.id = s.event_id
               WHERE s.id = ?""",
            (cursor.lastrowid,),
        ).fetchone()
    return dict(row)


@app.get("/api/locations/search")
def search_hamburg_locations(
    q: str = Query(min_length=4, max_length=120),
    _: str = Depends(require_admin),
):
    query = q.strip()
    if not query:
        raise HTTPException(status_code=422, detail="Suchbegriff darf nicht leer sein")
    cache_key = query.casefold()
    now = time.monotonic()
    cached = geocode_cache.get(cache_key)
    if cached and cached[0] > now:
        return {"suggestions": cached[1], "attribution": "Photon · OpenStreetMap"}

    south, north, west, east = HAMBURG_BOUNDS
    parameters = urlencode(
        {
            "q": query,
            "limit": 6,
            "lang": "de",
            "bbox": f"{west},{south},{east},{north}",
        }
    )
    request = URLRequest(
        f"https://photon.komoot.io/api/?{parameters}",
        headers={"User-Agent": "RiskPilotHamburg/1.0 (local emergency response dashboard)"},
    )
    try:
        with urlopen(
            request,
            timeout=5,
            context=ssl.create_default_context(cafile=certifi.where()),
        ) as response:
            payload = json.loads(response.read(512_001))
    except (TimeoutError, URLError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=502, detail="Adresssuche ist momentan nicht erreichbar") from error

    features = payload.get("features", []) if isinstance(payload, dict) else []
    suggestions: list[dict[str, str | float]] = []
    for feature in features:
        if not isinstance(feature, dict):
            continue
        geometry = feature.get("geometry", {})
        properties = feature.get("properties", {})
        coordinates = geometry.get("coordinates", []) if isinstance(geometry, dict) else []
        if not isinstance(coordinates, list) or len(coordinates) < 2 or not isinstance(properties, dict):
            continue
        longitude, latitude = coordinates[:2]
        if not isinstance(latitude, (int, float)) or not isinstance(longitude, (int, float)):
            continue
        if not (south <= latitude <= north and west <= longitude <= east):
            continue

        street = properties.get("street")
        house_number = properties.get("housenumber")
        address = " ".join(part for part in (street, house_number) if isinstance(part, str))
        if not address:
            address = properties.get("name")
        if not isinstance(address, str) or not address.strip():
            continue
        postcode = properties.get("postcode")
        postal_city = " ".join(
            part for part in (postcode if isinstance(postcode, str) else "", "Hamburg") if part
        )
        label = f"{address.strip()}, {postal_city}, Deutschland"
        suggestions.append(
            {"label": label, "latitude": float(latitude), "longitude": float(longitude)}
        )

    geocode_cache[cache_key] = (now + 5 * 60, suggestions)
    for expired_key in [key for key, (expiry, _) in geocode_cache.items() if expiry <= now]:
        geocode_cache.pop(expired_key, None)
    while len(geocode_cache) > 256:
        geocode_cache.pop(next(iter(geocode_cache)))
    return {"suggestions": suggestions, "attribution": "Photon · OpenStreetMap"}


@app.get("/")
def home():
    return {"message": "RiskPilot läuft!"}