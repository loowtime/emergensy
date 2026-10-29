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

Die Leaflet-Karte zeigt ausgewählte Ereignisse an Hamburger Adressen und kann offene Einsätze gemeinsam fokussieren. Bei der Adresssuche kann die Hausnummer zusammen mit der Straße eingegeben werden; Treffer müssen bei einer Hausnummer mit dem Kartendatensatz übereinstimmen. Photon verwendet OpenStreetMap-Daten und erhält den Suchtext zur Auflösung.

Das Stabsprotokoll hält Beobachtungen, Entscheidungen, Maßnahmen, Ressourcenhinweise und Übergaben mit Serverzeit und optionalem Ereignisbezug fest. Frühere Einträge lassen sich nach Zeitraum, Typ, Ereignis oder Text filtern und seitenweise durchsehen. Ein Bericht aus den aktiven Filtern kann mit Titel und Teilnehmenden geöffnet und über den Browser als PDF gespeichert werden.

Kürzel und Teilnehmende werden manuell eingegeben; das Protokoll ist kein manipulationssicheres Audit-Log und ersetzt keine revisionssichere Dokumentation. Für den Produktivbetrieb ist der lokale Demo-Login nicht geeignet.

## Projektstruktur

- `src/App.tsx` verbindet Sitzungsverwaltung, Dashboard und Feature-Komponenten.
- `src/api.ts` bündelt typisierte Backend-Aufrufe; `src/types.ts` enthält gemeinsame Domänentypen.
- `src/features/auth/` enthält die Admin-Anmeldung samt eigenen Styles.
- `src/features/events/` enthält Ereigniserstellung, Lagekarte und Hamburger Einsatzorte.
- `src/features/situation-log/` enthält Protokoll, Historie und Druckbericht.
- Styles liegen bei den jeweiligen Features; `src/App.css` enthält weiterhin die gemeinsamen Dashboard- und Layout-Styles.
