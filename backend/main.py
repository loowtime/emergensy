import sqlite3
from contextlib import closing
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI()
DATABASE_PATH = Path(__file__).with_name("riskpilot.db")


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
        connection.commit()


initialize_database()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class EventCreate(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    category: Literal["Brand", "Verkehr", "Infrastruktur", "Wetter", "Sonstiges"]
    severity: Literal["critical", "warning", "info"]
    location: str = Field(min_length=3, max_length=180)
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