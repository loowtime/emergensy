# RiskPilot Frontend

React 19, TypeScript und Vite bilden das Frontend des Ereignis-Dashboards.
Halfmoon 2 stellt die UI-Grundkomponenten bereit; die variable Inter-Schrift wird lokal gebündelt.

## Entwicklung

```bash
npm install
npm run dev
npm run build
npm run lint
```

Das Frontend verwendet standardmäßig `http://127.0.0.1:8000` als FastAPI-Adresse. Für eine andere Adresse kann `VITE_API_URL` gesetzt werden; außerhalb von localhost ist HTTPS erforderlich. Der lokale Demo-Login lautet im Entwicklungsmodus `admin` / `admin`; eine Registrierung gibt es nicht. Nach fünf falschen Passwörtern innerhalb von 15 Minuten wird die IP für 15 Minuten gesperrt. Admin-Tokens bleiben nur im Arbeitsspeicher der Seite und gehen beim Neuladen verloren.

Für einen zusätzlichen Konfigurationsschutz kann das Backend mit `RISKPILOT_ENV=production` gestartet werden. Dann müssen `RISKPILOT_ADMIN_USER` auf einen anderen Wert als `admin` und `RISKPILOT_ADMIN_PASSWORD` auf ein Passwort mit mindestens 16 Zeichen gesetzt sein; andernfalls startet das Backend nicht. Der Backend-Zugriff ist weiterhin absichtlich auf Loopback-Clients, lokale Hostnamen und lokale Browser-Origin beschränkt. Ein Reverse Proxy oder eine öffentliche Bereitstellung ist damit nicht automatisch abgesichert oder unterstützt.

Die Leaflet-Karte zeigt ausgewählte Ereignisse an Hamburger Adressen und kann offene Einsätze gemeinsam fokussieren. Bei der Adresssuche kann die Hausnummer zusammen mit der Straße eingegeben werden; Treffer müssen bei einer Hausnummer mit dem Kartendatensatz übereinstimmen. Photon verwendet OpenStreetMap-Daten und erhält den Suchtext zur Auflösung.

Das Stabsprotokoll hält Beobachtungen, Entscheidungen, Maßnahmen, Ressourcenhinweise und Übergaben mit Serverzeit und optionalem Ereignisbezug fest. Das Forschungsrisikoregister unterscheidet Forschungsdimensionen wie Methodik, Datenqualität/Reproduzierbarkeit, Ethik, Datenschutz und Transfer. Es dokumentiert Brutto- und Restrisiko getrennt, zeigt beide 5×5-Matrizen, weist Owner, Kontrollen, Behandlung, Frühindikatoren und Review-Termine aus und verlangt für akzeptierte Risiken eine begründete Freigabe. Frühere Einträge lassen sich nach Zeitraum, Typ, Ereignis oder Text filtern und seitenweise durchsehen. Ein Bericht aus den aktiven Filtern kann mit Titel und Teilnehmenden geöffnet und über den Browser als PDF gespeichert werden.

Kürzel und Teilnehmende werden manuell eingegeben; das Protokoll ist kein manipulationssicheres Audit-Log und ersetzt keine revisionssichere Dokumentation. Für den Produktivbetrieb ist der lokale Demo-Login nicht geeignet.

## Projektstruktur

- `src/App.tsx` verbindet Sitzungsverwaltung, Dashboard und Feature-Komponenten.
- `src/api.ts` bündelt typisierte Backend-Aufrufe; `src/types.ts` enthält gemeinsame Domänentypen.
- `src/features/auth/` enthält die Admin-Anmeldung samt eigenen Styles.
- `src/features/events/` enthält Ereigniserstellung, Lagekarte, Ereignisliste und Hamburger Einsatzorte.
- `src/features/situation-log/` enthält Protokoll, Historie, gemeinsame Darstellung und Druckbericht.
- Styles liegen bei den jeweiligen Features; `src/App.css` enthält weiterhin die gemeinsamen Dashboard- und Layout-Styles.
