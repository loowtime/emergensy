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
from typing import Any, Literal
from urllib.error import URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request as URLRequest, urlopen

import certifi
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, model_validator

app = FastAPI()
DATABASE_PATH = Path(__file__).with_name("riskpilot.db")
RISKPILOT_ENV = os.getenv("RISKPILOT_ENV", "development").strip().lower()
ADMIN_USERNAME = os.getenv(
    "RISKPILOT_ADMIN_USER", "admin" if RISKPILOT_ENV == "development" else ""
).strip()
ADMIN_PASSWORD = os.getenv("RISKPILOT_ADMIN_PASSWORD", "admin" if RISKPILOT_ENV == "development" else "")


def validate_security_configuration(environment: str, username: str, password: str) -> None:
    if environment not in {"development", "production"}:
        raise RuntimeError("RISKPILOT_ENV muss 'development' oder 'production' sein")
    if environment == "production" and (
        not username
        or username.casefold() == "admin"
        or len(password) < 16
        or not password.strip()
    ):
        raise RuntimeError(
            "Produktionsbetrieb erfordert RISKPILOT_ADMIN_USER != 'admin' "
            "und ein RISKPILOT_ADMIN_PASSWORD mit mindestens 16 Zeichen"
        )


validate_security_configuration(RISKPILOT_ENV, ADMIN_USERNAME, ADMIN_PASSWORD)

SESSION_TTL_SECONDS = 2 * 60 * 60
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
        connection.execute(
            """CREATE TABLE IF NOT EXISTS staff_protocols (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                meeting_date TEXT NOT NULL DEFAULT '',
                meeting_time TEXT NOT NULL DEFAULT '',
                revision INTEGER NOT NULL DEFAULT 1,
                protocol_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )"""
        )
        protocol_columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(staff_protocols)")
        }
        if "meeting_date" not in protocol_columns:
            connection.execute(
                "ALTER TABLE staff_protocols ADD COLUMN meeting_date TEXT NOT NULL DEFAULT ''"
            )
        if "meeting_time" not in protocol_columns:
            connection.execute(
                "ALTER TABLE staff_protocols ADD COLUMN meeting_time TEXT NOT NULL DEFAULT ''"
            )
        connection.execute(
            """CREATE TABLE IF NOT EXISTS staff_protocol_revisions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                protocol_id INTEGER NOT NULL REFERENCES staff_protocols(id) ON DELETE CASCADE,
                revision INTEGER NOT NULL,
                changed_by TEXT NOT NULL,
                snapshot_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(protocol_id, revision)
            )"""
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_staff_protocol_revisions_protocol "
            "ON staff_protocol_revisions(protocol_id, revision DESC)"
        )
        connection.execute(
            """CREATE TABLE IF NOT EXISTS operation_commands (
                event_id INTEGER PRIMARY KEY,
                revision INTEGER NOT NULL,
                document_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )"""
        )
        connection.execute(
            """CREATE TABLE IF NOT EXISTS operation_command_revisions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id INTEGER NOT NULL,
                revision INTEGER NOT NULL,
                document_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(event_id, revision)
            )"""
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_operation_command_revisions_event "
            "ON operation_command_revisions(event_id, revision DESC)"
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


OperationPhase = Literal["situation", "planning", "command", "control"]
CommandStaffCode = Literal["S1", "S2", "S3", "S4", "S5", "S6"]


def default_command_phase_notes() -> dict[str, str]:
    return {phase: "" for phase in ("situation", "planning", "command", "control")}


def default_command_staff_positions() -> list[dict[str, str]]:
    return [
        {"code": "S1", "owner": "", "status": "unassigned", "focus": ""},
        {"code": "S2", "owner": "", "status": "unassigned", "focus": ""},
        {"code": "S3", "owner": "", "status": "unassigned", "focus": ""},
        {"code": "S4", "owner": "", "status": "unassigned", "focus": ""},
        {"code": "S5", "owner": "", "status": "unassigned", "focus": ""},
        {"code": "S6", "owner": "", "status": "unassigned", "focus": ""},
    ]


class OperationCommandInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


class OperationStaffPosition(OperationCommandInput):
    code: CommandStaffCode
    owner: str = Field(default="", max_length=120)
    status: Literal["unassigned", "active", "support_needed"] = "unassigned"
    focus: str = Field(default="", max_length=500)


class OperationOrder(OperationCommandInput):
    id: str = Field(min_length=1, max_length=36, pattern=r"^[A-Za-z0-9_-]+$")
    task: str = Field(min_length=3, max_length=1000)
    recipient: str = Field(min_length=2, max_length=160)
    resources: str = Field(default="", max_length=500)
    reporting_point: str = Field(default="", max_length=500)
    due_at: datetime | None = None
    status: Literal["open", "in_progress", "completed", "blocked"] = "open"
    feedback_required: bool = True


class OperationReport(OperationCommandInput):
    id: str = Field(min_length=1, max_length=36, pattern=r"^[A-Za-z0-9_-]+$")
    source: str = Field(min_length=2, max_length=160)
    content: str = Field(min_length=3, max_length=1200)
    confidence: Literal["unverified", "verified"] = "unverified"
    reported_at: datetime


class OperationAdvisor(OperationCommandInput):
    id: str = Field(min_length=1, max_length=36, pattern=r"^[A-Za-z0-9_-]+$")
    organization: str = Field(min_length=2, max_length=160)
    contact_person: str = Field(default="", max_length=120)
    focus: str = Field(default="", max_length=500)
    status: Literal["requested", "connected", "not_required"] = "requested"


class OperationCommandDocument(OperationCommandInput):
    command_lead: str = Field(default="", max_length=120)
    phase: OperationPhase = "situation"
    situation_summary: str = Field(default="", max_length=3000)
    mission: str = Field(default="", max_length=1000)
    intent: str = Field(default="", max_length=1500)
    next_review_at: datetime | None = None
    phase_notes: dict[OperationPhase, str] = Field(default_factory=default_command_phase_notes)
    staff_positions: list[OperationStaffPosition] = Field(
        default_factory=default_command_staff_positions, min_length=6, max_length=6
    )
    advisors: list[OperationAdvisor] = Field(default_factory=list, max_length=40)
    orders: list[OperationOrder] = Field(default_factory=list, max_length=100)
    reports: list[OperationReport] = Field(default_factory=list, max_length=200)

    @model_validator(mode="before")
    @classmethod
    def populate_legacy_defaults(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value
        normalized = value.copy()
        default_document = {
            "phase_notes": default_command_phase_notes(),
            "staff_positions": default_command_staff_positions(),
            "advisors": [],
        }
        for field_name, default in default_document.items():
            if field_name not in normalized:
                normalized[field_name] = default
            elif field_name == "phase_notes" and isinstance(normalized[field_name], dict):
                normalized[field_name] = {
                    **default,
                    **normalized[field_name],
                }
        return normalized

    @model_validator(mode="after")
    def validate_unique_operations(self):
        codes = [position.code for position in self.staff_positions]
        if len(codes) != len(set(codes)):
            raise ValueError("Jede Führungsfunktion darf nur einmal zugeordnet sein")
        if len(codes) != 6 or set(codes) != {"S1", "S2", "S3", "S4", "S5", "S6"}:
            raise ValueError("Die Führungsfunktionen S1 bis S6 müssen vollständig enthalten sein")
        identifiers = [item.id for item in (*self.advisors, *self.orders, *self.reports)]
        if len(identifiers) != len(set(identifiers)):
            raise ValueError("IDs für Kontakte, Aufträge und Meldungen müssen eindeutig sein")
        return self


class OperationCommandUpdate(OperationCommandInput):
    expected_revision: int = Field(ge=0)
    document: OperationCommandDocument


class AdminLogin(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=200)


class SituationLogCreate(BaseModel):
    entry_type: Literal["observation", "decision", "measure", "resource", "handover"]
    content: str = Field(min_length=1, max_length=1200)
    author: str = Field(min_length=1, max_length=80)
    event_id: int | None = Field(default=None, ge=1)


class StaffProtocolInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


class StaffProtocolRisk(StaffProtocolInput):
    id: str = Field(min_length=1, max_length=36, pattern=r"^[A-Za-z0-9_-]+$")
    title: str = Field(min_length=3, max_length=180)
    category: Literal[
        "methodology",
        "data_quality",
        "ethics",
        "privacy",
        "security",
        "resources",
        "timeline",
        "dependencies",
        "transfer",
        "other",
    ] = "other"
    probability: int = Field(ge=1, le=5)
    impact: int = Field(ge=1, le=5)
    residual_probability: int = Field(ge=1, le=5)
    residual_impact: int = Field(ge=1, le=5)
    owner: str = Field(default="", max_length=120)
    status: Literal["identified", "treating", "accepted", "closed"] = "identified"
    treatment: Literal["reduce", "avoid", "share", "accept"] = "reduce"
    existing_controls: str = Field(default="", max_length=1200)
    response_plan: str = Field(default="", max_length=1200)
    trigger: str = Field(default="", max_length=500)
    review_date: date | None = None
    evidence: str = Field(default="", max_length=1200)
    acceptance_rationale: str = Field(default="", max_length=1200)
    accepted_by: str = Field(default="", max_length=120)

    @model_validator(mode="before")
    @classmethod
    def preserve_legacy_scores(cls, value: Any) -> Any:
        if isinstance(value, dict):
            value = value.copy()
            value.setdefault("residual_probability", value.get("probability", 3))
            value.setdefault("residual_impact", value.get("impact", 3))
        return value

    @model_validator(mode="after")
    def validate_acceptance(self):
        if self.status == "accepted":
            if self.treatment != "accept":
                raise ValueError("Akzeptierte Risiken benötigen die Behandlungsstrategie 'accept'")
            if not self.accepted_by.strip() or not self.acceptance_rationale.strip():
                raise ValueError("Akzeptierte Risiken benötigen Begründung und freigebende Person")
        return self


class StaffProtocolTopic(StaffProtocolInput):
    id: str = Field(min_length=1, max_length=36, pattern=r"^[A-Za-z0-9_-]+$")
    title: str = Field(min_length=3, max_length=180)
    findings: str = Field(default="", max_length=1200)


class StaffProtocolDecision(StaffProtocolInput):
    id: str = Field(min_length=1, max_length=36, pattern=r"^[A-Za-z0-9_-]+$")
    text: str = Field(min_length=3, max_length=500)
    rationale: str = Field(default="", max_length=1200)
    owner: str = Field(min_length=2, max_length=120)
    risk_id: str | None = Field(default=None, max_length=36)


class StaffProtocolMeasure(StaffProtocolInput):
    id: str = Field(min_length=1, max_length=36, pattern=r"^[A-Za-z0-9_-]+$")
    task: str = Field(min_length=3, max_length=500)
    owner: str = Field(min_length=2, max_length=120)
    due_date: date | None = None
    status: Literal["open", "in_progress", "completed"] = "open"
    decision_id: str | None = Field(default=None, max_length=36)


class StaffProtocolOpenPoint(StaffProtocolInput):
    id: str = Field(min_length=1, max_length=36, pattern=r"^[A-Za-z0-9_-]+$")
    question: str = Field(min_length=3, max_length=500)
    owner: str = Field(default="", max_length=120)
    follow_up_date: date | None = None


class StaffProtocolDocument(StaffProtocolInput):
    title: str = Field(min_length=3, max_length=160)
    meeting_date: date
    meeting_time: str = Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    session_lead: str = Field(min_length=2, max_length=120)
    participants: str = Field(default="", max_length=2000)
    recorder: str = Field(min_length=2, max_length=120)
    occasion: str = Field(min_length=3, max_length=1200)
    situation_summary: str = Field(default="", max_length=4000)
    risks: list[StaffProtocolRisk] = Field(default_factory=list, max_length=50)
    topics: list[StaffProtocolTopic] = Field(default_factory=list, max_length=50)
    decisions: list[StaffProtocolDecision] = Field(default_factory=list, max_length=50)
    measures: list[StaffProtocolMeasure] = Field(default_factory=list, max_length=100)
    open_points: list[StaffProtocolOpenPoint] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def validate_references(self):
        risk_ids = [risk.id for risk in self.risks]
        topic_ids = [topic.id for topic in self.topics]
        decision_ids = [decision.id for decision in self.decisions]
        measure_ids = [measure.id for measure in self.measures]
        open_point_ids = [point.id for point in self.open_points]
        for label, identifiers in (
            ("Risiko", risk_ids),
            ("Thema", topic_ids),
            ("Beschluss", decision_ids),
            ("Maßnahme", measure_ids),
            ("Offener Punkt", open_point_ids),
        ):
            if len(identifiers) != len(set(identifiers)):
                raise ValueError(f"{label}-IDs müssen innerhalb des Protokolls eindeutig sein")
        if any(decision.risk_id and decision.risk_id not in risk_ids for decision in self.decisions):
            raise ValueError("Ein Beschluss verweist auf ein unbekanntes Risiko")
        if any(measure.decision_id and measure.decision_id not in decision_ids for measure in self.measures):
            raise ValueError("Eine Maßnahme verweist auf einen unbekannten Beschluss")
        return self


class StaffProtocolUpdate(StaffProtocolInput):
    expected_revision: int = Field(ge=1)
    protocol: StaffProtocolDocument


def serialize_event(row: sqlite3.Row):
    return dict(row)


def request_client_key(request: Request) -> str:
    host = request.client.host if request.client else "unknown"
    return hashlib.sha256(host.encode("utf-8")).hexdigest()


def is_loopback_host(host: str | None) -> bool:
    if not host:
        return False
    try:
        parsed_host = urlsplit(f"//{host}")
    except ValueError:
        return False
    if (
        parsed_host.username
        or parsed_host.password
        or parsed_host.path
        or parsed_host.query
        or parsed_host.fragment
    ):
        return False
    hostname = parsed_host.hostname
    if not hostname:
        return False
    if hostname.casefold() == "localhost":
        return True
    try:
        return ip_address(hostname).is_loopback
    except ValueError:
        return False


def require_local_client(request: Request):
    host = request.client.host if request.client else ""
    try:
        is_loopback = ip_address(host).is_loopback
    except ValueError:
        is_loopback = False
    request_host_is_local = is_loopback_host(request.headers.get("host"))
    origin = request.headers.get("origin")
    if origin:
        try:
            parsed_origin = urlsplit(origin)
            origin_is_local = (
                parsed_origin.scheme in {"http", "https"}
                and not parsed_origin.username
                and not parsed_origin.password
                and not parsed_origin.path
                and not parsed_origin.query
                and not parsed_origin.fragment
                and is_loopback_host(parsed_origin.netloc)
            )
        except ValueError:
            origin_is_local = False
    else:
        origin_is_local = True
    if not is_loopback or not request_host_is_local or not origin_is_local:
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


def serialize_staff_protocol(row: sqlite3.Row) -> dict:
    protocol = StaffProtocolDocument.model_validate(json.loads(row["protocol_json"]))
    return {
        "id": row["id"],
        "revision": row["revision"],
        "protocol": protocol.model_dump(mode="json"),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


@app.get("/api/staff-protocols")
def list_staff_protocols(
    offset: int = Query(default=0, ge=0, le=1_000_000),
    limit: int = Query(default=50, ge=1, le=100),
    _: str = Depends(require_admin),
):
    with closing(get_connection()) as connection:
        total = connection.execute("SELECT COUNT(*) FROM staff_protocols").fetchone()[0]
        rows = connection.execute(
            """SELECT * FROM staff_protocols
               ORDER BY meeting_date DESC, meeting_time DESC, id DESC
               LIMIT ? OFFSET ?""",
            (limit, offset),
        ).fetchall()
    return {
        "records": [serialize_staff_protocol(row) for row in rows],
        "total": total,
        "offset": offset,
        "limit": limit,
    }


@app.post("/api/staff-protocols", status_code=201)
def create_staff_protocol(protocol: StaffProtocolDocument, _: str = Depends(require_admin)):
    protocol_json = json.dumps(protocol.model_dump(mode="json"), ensure_ascii=False, separators=(",", ":"))
    timestamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with closing(get_connection()) as connection:
        connection.execute("BEGIN IMMEDIATE")
        cursor = connection.execute(
            """INSERT INTO staff_protocols
               (meeting_date, meeting_time, revision, protocol_json, created_at, updated_at)
               VALUES (?, ?, 1, ?, ?, ?)""",
            (
                protocol.meeting_date.isoformat(),
                protocol.meeting_time,
                protocol_json,
                timestamp,
                timestamp,
            ),
        )
        protocol_id = cursor.lastrowid
        connection.execute(
            """INSERT INTO staff_protocol_revisions
               (protocol_id, revision, changed_by, snapshot_json, created_at)
               VALUES (?, 1, 'Admin', ?, ?)""",
            (protocol_id, protocol_json, timestamp),
        )
        connection.commit()
        row = connection.execute(
            "SELECT * FROM staff_protocols WHERE id = ?", (protocol_id,)
        ).fetchone()
    return serialize_staff_protocol(row)


@app.get("/api/staff-protocols/{protocol_id}")
def get_staff_protocol(protocol_id: int, _: str = Depends(require_admin)):
    with closing(get_connection()) as connection:
        row = connection.execute(
            "SELECT * FROM staff_protocols WHERE id = ?", (protocol_id,)
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Stabsprotokoll nicht gefunden")
    return serialize_staff_protocol(row)


@app.put("/api/staff-protocols/{protocol_id}")
def update_staff_protocol(
    protocol_id: int,
    update: StaffProtocolUpdate,
    _: str = Depends(require_admin),
):
    protocol_json = json.dumps(
        update.protocol.model_dump(mode="json"), ensure_ascii=False, separators=(",", ":")
    )
    timestamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with closing(get_connection()) as connection:
        connection.execute("BEGIN IMMEDIATE")
        current = connection.execute(
            "SELECT revision FROM staff_protocols WHERE id = ?", (protocol_id,)
        ).fetchone()
        if current is None:
            connection.rollback()
            raise HTTPException(status_code=404, detail="Stabsprotokoll nicht gefunden")
        if current["revision"] != update.expected_revision:
            connection.rollback()
            raise HTTPException(
                status_code=409,
                detail="Das Protokoll wurde zwischenzeitlich geändert. Bitte neu laden.",
            )
        revision = current["revision"] + 1
        connection.execute(
            """UPDATE staff_protocols
               SET meeting_date = ?, meeting_time = ?, revision = ?,
                   protocol_json = ?, updated_at = ?
               WHERE id = ?""",
            (
                update.protocol.meeting_date.isoformat(),
                update.protocol.meeting_time,
                revision,
                protocol_json,
                timestamp,
                protocol_id,
            ),
        )
        connection.execute(
            """INSERT INTO staff_protocol_revisions
               (protocol_id, revision, changed_by, snapshot_json, created_at)
               VALUES (?, ?, 'Admin', ?, ?)""",
            (protocol_id, revision, protocol_json, timestamp),
        )
        connection.commit()
        row = connection.execute(
            "SELECT * FROM staff_protocols WHERE id = ?", (protocol_id,)
        ).fetchone()
    return serialize_staff_protocol(row)


@app.get("/api/staff-protocols/{protocol_id}/revisions")
def list_staff_protocol_revisions(
    protocol_id: int,
    _: str = Depends(require_admin),
):
    with closing(get_connection()) as connection:
        protocol = connection.execute(
            "SELECT 1 FROM staff_protocols WHERE id = ?", (protocol_id,)
        ).fetchone()
        if protocol is None:
            raise HTTPException(status_code=404, detail="Stabsprotokoll nicht gefunden")
        rows = connection.execute(
            """SELECT revision, changed_by, snapshot_json, created_at
               FROM staff_protocol_revisions
               WHERE protocol_id = ?
               ORDER BY revision DESC""",
            (protocol_id,),
        ).fetchall()
    return [
        {
            "revision": row["revision"],
            "changed_by": row["changed_by"],
            "protocol": StaffProtocolDocument.model_validate(
                json.loads(row["snapshot_json"])
            ).model_dump(mode="json"),
            "created_at": row["created_at"],
        }
        for row in rows
    ]


def serialize_operation_command(event_id: int, revision: int, document: dict, updated_at: str | None) -> dict:
    validated = OperationCommandDocument.model_validate(document)
    return {
        "event_id": event_id,
        "revision": revision,
        "document": validated.model_dump(mode="json"),
        "updated_at": updated_at,
    }


@app.get("/api/operations/{event_id}/command")
def get_operation_command(event_id: int, _: str = Depends(require_admin)):
    with closing(get_connection()) as connection:
        event = connection.execute("SELECT 1 FROM events WHERE id = ?", (event_id,)).fetchone()
        if event is None:
            raise HTTPException(status_code=404, detail="Ereignis nicht gefunden")
        row = connection.execute(
            "SELECT revision, document_json, updated_at FROM operation_commands WHERE event_id = ?",
            (event_id,),
        ).fetchone()
    if row is None:
        document = OperationCommandDocument()
        return serialize_operation_command(event_id, 0, document.model_dump(mode="json"), None)
    return serialize_operation_command(
        event_id, row["revision"], json.loads(row["document_json"]), row["updated_at"]
    )


@app.put("/api/operations/{event_id}/command")
def save_operation_command(
    event_id: int,
    update: OperationCommandUpdate,
    _: str = Depends(require_admin),
):
    document_json = json.dumps(
        update.document.model_dump(mode="json"), ensure_ascii=False, separators=(",", ":")
    )
    timestamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with closing(get_connection()) as connection:
        connection.execute("BEGIN IMMEDIATE")
        event = connection.execute("SELECT 1 FROM events WHERE id = ?", (event_id,)).fetchone()
        if event is None:
            connection.rollback()
            raise HTTPException(status_code=404, detail="Ereignis nicht gefunden")
        current = connection.execute(
            "SELECT revision FROM operation_commands WHERE event_id = ?", (event_id,)
        ).fetchone()
        current_revision = current["revision"] if current else 0
        if current_revision != update.expected_revision:
            connection.rollback()
            raise HTTPException(
                status_code=409,
                detail="Die Einsatzführung wurde zwischenzeitlich geändert. Bitte neu laden.",
            )
        revision = current_revision + 1
        connection.execute(
            """INSERT INTO operation_commands (event_id, revision, document_json, updated_at)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(event_id) DO UPDATE SET
                   revision = excluded.revision,
                   document_json = excluded.document_json,
                   updated_at = excluded.updated_at""",
            (event_id, revision, document_json, timestamp),
        )
        connection.execute(
            """INSERT INTO operation_command_revisions
               (event_id, revision, document_json, created_at)
               VALUES (?, ?, ?, ?)""",
            (event_id, revision, document_json, timestamp),
        )
        connection.commit()
    return serialize_operation_command(
        event_id, revision, json.loads(document_json), timestamp
    )


@app.get("/api/operations/{event_id}/command/revisions")
def list_operation_command_revisions(event_id: int, _: str = Depends(require_admin)):
    with closing(get_connection()) as connection:
        event = connection.execute("SELECT 1 FROM events WHERE id = ?", (event_id,)).fetchone()
        if event is None:
            raise HTTPException(status_code=404, detail="Ereignis nicht gefunden")
        rows = connection.execute(
            """SELECT revision, document_json, created_at
               FROM operation_command_revisions
               WHERE event_id = ?
               ORDER BY revision DESC LIMIT 100""",
            (event_id,),
        ).fetchall()
    return [
        serialize_operation_command(
            event_id, row["revision"], json.loads(row["document_json"]), row["created_at"]
        )
        for row in rows
    ]


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
    query_without_postcode = re.sub(r"\b\d{5}\b", "", query)
    query_without_city = re.sub(
        r"\b(?:hamburg|deutschland|germany)\b", "", query_without_postcode, flags=re.IGNORECASE
    ).strip(" ,")
    requested_house_number_match = re.search(
        r"(?<!\w)(\d+[a-zA-Z]?(?:[-/]\d+[a-zA-Z]?)?)\s*$", query_without_city
    )
    requested_house_number = (
        requested_house_number_match.group(1).casefold()
        if requested_house_number_match
        else None
    )
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
        if requested_house_number and (
            not isinstance(house_number, str)
            or house_number.casefold() != requested_house_number
        ):
            continue
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