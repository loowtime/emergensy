# emergensy
Emergensy ist ein Dashboard für Ereignisübersicht und Risikomanagement. Die aktuelle Version unterstützt das Anlegen, Suchen, Priorisieren und Verwalten von Ereignissen und zeigt ausgewählte Hamburger Einsatzadressen auf der Karte. Funktionen wie Live-Lagebilder, Ressourcenverwaltung, Evakuierungsplanung und Einsatzsimulation sind noch nicht implementiert.

## Lokale Entwicklung

Backend in einem Terminal starten:

```bash
cd backend
# Einmalig, falls die Abhängigkeiten noch nicht installiert sind:
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m uvicorn main:app --reload
```

Frontend in einem zweiten Terminal starten:

```bash
cd frontend
npm install
npm run dev
```

Das Dashboard ist danach unter `http://localhost:5173` erreichbar. Die FastAPI-Dokumentation liegt unter `http://127.0.0.1:8000/docs`. Ereignisse werden lokal in `backend/riskpilot.db` gespeichert.

## Anmeldung und Ereignisverwaltung

- Lokaler Admin-Demo-Login: Benutzername `admin`, Passwort `admin`; eine Registrierung gibt es nicht.
- Login und Ereignis-API akzeptieren ausschließlich lokale Verbindungen. Uvicorn standardmäßig nicht mit `--host 0.0.0.0` starten und den Demo-Zugang niemals öffentlich bereitstellen.
- Admin-Passwort und Benutzername können mit `RISKPILOT_ADMIN_USER` und `RISKPILOT_ADMIN_PASSWORD` überschrieben werden. Für den produktiven Einsatz ist eine vollständige Produktions-Authentifizierung und ein sicherer Betrieb zwingend erforderlich.
- Anmeldung stellt ein zeitlich begrenztes Bearer-Token aus; Ereignis-API-Endpunkte verlangen dieses Token.
- Fünf falsche Logins innerhalb von 15 Minuten sperren die Client-IP für 15 Minuten. Der Sperrzähler wird in SQLite gespeichert; IP-Adressen werden dafür nur als SHA-256-Hash persistiert.
- API-Antworten erhalten Sicherheitsheader und werden nicht gecacht. API-Login und geschützte Endpunkte sind ausschließlich lokal erreichbar.

- Ereignisse mit Kategorie, Priorität, Ort, Beschreibung und Verantwortlichem anlegen
- Ereignisse nach Priorität filtern und über Titel, Ort, Beschreibung oder Verantwortlichem suchen
- Status zwischen Offen, In Beobachtung und Abgeschlossen ändern
- Kennzahlen werden aus den gespeicherten Backend-Ereignissen berechnet
- Ereignisse können gelöscht werden; die API prüft Anmeldung und Existenz des Eintrags.
- Adressen können frei eingegeben und über Photon mit OpenStreetMap-Daten vervollständigt werden. Vorschläge sind auf Hamburg begrenzt; ausgewählte Koordinaten werden im vorhandenen SQLite-Datensatz gespeichert und auf der Karte dargestellt.
- Adresssuchtexte werden vom Backend an Photon (`photon.komoot.io`) übermittelt. Es gibt eine kurze serverseitige Cache-Dauer; für den externen Dienst gelten dessen Verfügbarkeit und Nutzungsbedingungen. Kein Google-Maps-Schlüssel erforderlich.
- Bereits gespeicherte Ereignisse bleiben erhalten. Ältere Einträge ohne Koordinaten werden als Altbestand markiert und nicht auf der Hamburg-Karte eingezeichnet.

## Technischer Stand

- Frontend: React 19, TypeScript, Vite, React Leaflet und CSS
- Backend: FastAPI mit Pydantic-Validierung und SQLite
- Authentifizierung: `POST /api/auth/login` und `POST /api/auth/logout`
- Ereignis-API: `GET` und `POST /api/events`, `PATCH /api/events/{id}` (Anmeldung erforderlich)
- Ereignisse löschen: `DELETE /api/events/{id}` (Anmeldung erforderlich)
- Hamburger Adressvorschläge: `GET /api/locations/search?q=...` (Anmeldung erforderlich)
- Die SQLite-Tabelle wird beim Start angelegt; ein separates Migrationssystem oder eine automatisierte Test-Suite ist derzeit nicht eingerichtet.
- Bestehende Ereignisdaten bleiben erhalten. Bereits vorhandene Orte außerhalb der neuen Hamburger Auswahlliste werden nicht automatisch verändert.
- Die Karte lädt OpenStreetMap-Kacheln über das Internet; Suchtexte zur Adressvervollständigung werden separat an Photon übermittelt.
