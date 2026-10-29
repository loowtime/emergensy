# RiskPilot Frontend

React 19, TypeScript und Vite bilden das Frontend des Ereignis-Dashboards.

## Entwicklung

```bash
npm install
npm run dev
npm run build
npm run lint
```

Das Frontend verwendet standardmäßig `http://127.0.0.1:8000` als FastAPI-Adresse. Für eine andere Adresse kann `VITE_API_URL` gesetzt werden. Der lokale Demo-Login lautet `admin` / `admin`; eine Registrierung gibt es nicht. Nach fünf falschen Passwörtern innerhalb von 15 Minuten wird die IP für 15 Minuten gesperrt. Ereignisänderungen verwenden das vom Backend ausgestellte Admin-Token.

Die Leaflet-Karte zeigt ausgewählte Ereignisse an den eingegebenen Hamburger Adressen. Adressvorschläge verwenden den Photon-Dienst mit OpenStreetMap-Daten; der Suchtext wird zur Auflösung dorthin übermittelt. Für den Produktivbetrieb ist der lokale Demo-Login nicht geeignet.
