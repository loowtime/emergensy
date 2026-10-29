# emergensy
Emergensy ist eine Echtzeit-Plattform für Gefahrenabwehr und Risikomanagement. Sie ermöglicht die Simulation, Analyse und Koordination komplexer Einsatz- und Katastrophenszenarien und verbindet Live-Karten, Risikoanalyse, Ressourcenverwaltung, Evakuierungsplanung und Einsatzsimulation in einer Webanwendung.

## Lokale Entwicklung

Backend in einem Terminal starten:

```bash
cd backend
.venv/bin/python -m uvicorn main:app --reload
```

Frontend in einem zweiten Terminal starten:

```bash
cd frontend
npm install
npm run dev
```

Das Dashboard ist danach unter `http://localhost:5173` erreichbar. Die FastAPI-Dokumentation liegt unter `http://127.0.0.1:8000/docs`. Ereignisse werden lokal in `backend/riskpilot.db` gespeichert.

## Ereignisverwaltung

- Ereignisse mit Kategorie, Priorität, Ort, Beschreibung und Verantwortlichem anlegen
- Ereignisse nach Priorität filtern und über Titel, Ort, Beschreibung oder Verantwortlichem suchen
- Status zwischen Offen, In Beobachtung und Abgeschlossen ändern
- Kennzahlen werden aus den gespeicherten Backend-Ereignissen berechnet
- Beispielmarker auf der Karte sind Vorschauwerte und nicht mit den Ereignisdaten verknüpft
