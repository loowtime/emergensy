import { useEffect, useState } from 'react'
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Bell, Check, ChevronDown, Clock3, CloudRain, Crosshair, Flame, Layers3, LocateFixed, MapPin, Menu, RefreshCw, Shield, Siren, Wifi, Wind, X } from 'lucide-react'
import L from 'leaflet'
import { MapContainer, Marker, Popup, TileLayer, ZoomControl } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import './App.css'

type Severity = 'critical' | 'warning' | 'info'
type Incident = { id: string; title: string; location: string; time: string; severity: Severity; coordinates: [number, number]; icon: typeof Flame }

const incidents: Incident[] = [
  { id: 'INC-2481', title: 'Gebäudebrand', location: 'Alexanderplatz 5, Mitte', time: 'vor 4 Min.', severity: 'critical', coordinates: [52.5219, 13.4132], icon: Flame },
  { id: 'INC-2479', title: 'Verkehrsunfall', location: 'Friedrichstraße / Unter den Linden', time: 'vor 12 Min.', severity: 'warning', coordinates: [52.5174, 13.3891], icon: AlertTriangle },
  { id: 'INC-2476', title: 'Wasserrohrbruch', location: 'Oranienburger Straße 18', time: 'vor 26 Min.', severity: 'info', coordinates: [52.5251, 13.3942], icon: CloudRain },
]

const markerIcons = Object.fromEntries(
  (['critical', 'warning', 'info'] as const).map((severity) => [severity, L.divIcon({
    className: 'incident-marker-shell',
    html: `<span class="incident-marker incident-marker--${severity}"><span></span></span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })]),
) as Record<Severity, L.DivIcon>

const API_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000'

async function requestBackend(): Promise<string> {
  const response = await fetch(`${API_URL}/`)
  if (!response.ok) throw new Error(`Backend antwortet mit ${response.status}`)
  const payload: { message?: string } = await response.json()
  return payload.message ?? 'Backend erreichbar'
}

function App() {
  const [apiState, setApiState] = useState<'checking' | 'online' | 'offline'>('checking')
  const [apiMessage, setApiMessage] = useState('Verbindung wird geprüft')
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const [filter, setFilter] = useState<'all' | Severity>('all')
  const [selectedIncident, setSelectedIncident] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    requestBackend().then((message) => {
      if (!active) return
      setApiMessage(message)
      setApiState('online')
      setLastChecked(new Date())
    }).catch(() => {
      if (!active) return
      setApiMessage('Backend nicht erreichbar')
      setApiState('offline')
    })
    return () => { active = false }
  }, [])

  async function refreshBackend() {
    setApiState('checking')
    try {
      setApiMessage(await requestBackend())
      setApiState('online')
      setLastChecked(new Date())
    } catch {
      setApiMessage('Backend nicht erreichbar')
      setApiState('offline')
    }
  }

  const visibleIncidents = incidents.filter((incident) => filter === 'all' || incident.severity === filter)

  return (
    <div className="app-shell">
      <aside className="rail" aria-label="Hauptnavigation">
        <a className="brand-mark" href="#overview" aria-label="RiskPilot Startseite"><Shield size={22} strokeWidth={2.2} /><span>R</span></a>
        <div className="rail-divider" />
        <button className="rail-button rail-button--active" title="Lageübersicht" aria-label="Lageübersicht"><Layers3 size={19} /></button>
        <button className="rail-button" title="Einsatzmeldungen" aria-label="Einsatzmeldungen"><Siren size={19} /></button>
        <button className="rail-button" title="Lagekarte" aria-label="Lagekarte"><MapPin size={19} /></button>
        <div className="rail-spacer" />
        <button className="rail-button" title="Benachrichtigungen" aria-label="Benachrichtigungen"><Bell size={19} /></button>
        <div className="avatar" title="Leitstelle Berlin">LB</div>
      </aside>

      <main className="workspace" id="overview">
        <header className="topbar">
          <div className="breadcrumb"><span>RISKPILOT</span><span className="breadcrumb-slash">/</span><strong>Einsatzübersicht</strong></div>
          <div className="topbar-right">
            <div className={`connection-pill connection-pill--${apiState}`}><span className="connection-dot" />{apiState === 'online' ? 'API verbunden' : apiState === 'offline' ? 'API offline' : 'Prüfe API'}</div>
            <button className="icon-button notification-button" aria-label="Benachrichtigungen"><Bell size={17} /><span /></button>
            <button className="profile-button"><span className="profile-avatar">MK</span><span className="profile-name">M. Keller</span><ChevronDown size={14} /></button>
          </div>
        </header>

        <section className="page-heading">
          <div>
            <div className="eyebrow"><span className="live-dot" /> LEITSTELLE BERLIN · DEMO-LAGE</div>
            <h1>Lageübersicht</h1>
            <p className="heading-subtitle">Einsatzlage Berlin-Mitte <span>·</span> Mittwoch, 28. Oktober 2026</p>
          </div>
          <div className="heading-actions">
            <span className="updated-label"><Clock3 size={14} /> Demo-Stand 10:42</span>
            <button className="refresh-button" onClick={() => void refreshBackend()} disabled={apiState === 'checking'}><RefreshCw size={15} className={apiState === 'checking' ? 'spin' : ''} /> Verbindung testen</button>
          </div>
        </section>

        <section className="metrics" aria-label="Lagekennzahlen">
          <article className="metric metric--urgent"><div className="metric-top"><span>Aktive Einsätze</span><Siren size={17} /></div><div className="metric-value">12 <span className="metric-change metric-change--up"><ArrowUpRight size={13} /> 3</span></div><div className="metric-foot">gegenüber letzter Stunde</div></article>
          <article className="metric"><div className="metric-top"><span>Einheiten im Einsatz</span><Activity size={17} /></div><div className="metric-value">38 <span className="metric-change"><ArrowDownRight size={13} /> 2</span></div><div className="metric-foot">von 64 verfügbaren Kräften</div></article>
          <article className="metric"><div className="metric-top"><span>Betroffene Personen</span><Shield size={17} /></div><div className="metric-value">146 <span className="metric-note">im Radius</span></div><div className="metric-foot">Prognose für den Einsatzbereich</div></article>
          <article className="metric metric--weather"><div className="metric-top"><span>Wetterlage</span><CloudRain size={17} /></div><div className="metric-value">11° <span className="metric-note">leichter Regen</span></div><div className="metric-foot"><Wind size={13} /> Wind 14 km/h · Sicht 8 km</div></article>
        </section>

        <section className="content-grid">
          <article className="map-panel">
            <div className="panel-heading map-heading">
              <div><h2>Einsatzkarte</h2><p><span className="map-live-dot" /> Demo-Meldungen <span className="panel-separator">·</span> Berlin-Mitte</p></div>
              <div className="map-tools"><button className="map-tool" title="Karte zentrieren" aria-label="Karte zentrieren"><LocateFixed size={16} /></button><button className="map-tool" title="Kartenebenen" aria-label="Kartenebenen"><Layers3 size={16} /></button><button className="map-tool map-menu" title="Weitere Kartenoptionen" aria-label="Weitere Kartenoptionen"><Menu size={16} /></button></div>
            </div>
            <div className="map-wrap">
              <MapContainer center={[52.5212, 13.405]} zoom={14} zoomControl={false} scrollWheelZoom className="incident-map">
                <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <ZoomControl position="bottomright" />
                {incidents.map((incident) => <Marker key={incident.id} position={incident.coordinates} icon={markerIcons[incident.severity]}><Popup><strong>{incident.title}</strong><br />{incident.location}<br /><small>{incident.id} · {incident.time}</small></Popup></Marker>)}
              </MapContainer>
              <div className="map-legend"><span><i className="legend-dot legend-dot--critical" /> Kritisch <b>1</b></span><span><i className="legend-dot legend-dot--warning" /> Warnung <b>1</b></span><span><i className="legend-dot legend-dot--info" /> Information <b>1</b></span></div>
              <div className="map-scale">© OpenStreetMap-Mitwirkende</div>
            </div>
            <div className="map-footer"><span><Crosshair size={14} /> Kartenmittelpunkt: 52.5212° N, 13.4050° E</span><button>Vollbild anzeigen <ArrowUpRight size={13} /></button></div>
          </article>

          <aside className="incident-panel">
            <div className="panel-heading incident-heading"><div><h2>Einsatzmeldungen</h2><p><span className="incident-total">12</span> laufende Vorgänge</p></div><button className="icon-button" aria-label="Meldungen schließen"><X size={16} /></button></div>
            <div className="filter-tabs" role="group" aria-label="Meldungen filtern">
              <button className={filter === 'all' ? 'filter-tab filter-tab--active' : 'filter-tab'} onClick={() => setFilter('all')}>Alle <span>12</span></button>
              <button className={filter === 'critical' ? 'filter-tab filter-tab--active' : 'filter-tab'} onClick={() => setFilter('critical')}>Kritisch <span>3</span></button>
              <button className={filter === 'warning' ? 'filter-tab filter-tab--active' : 'filter-tab'} onClick={() => setFilter('warning')}>Warnung <span>5</span></button>
            </div>
            <div className="incident-list">
              {visibleIncidents.map((incident) => {
                const Icon = incident.icon
                return <button key={incident.id} className={`incident-item ${selectedIncident === incident.id ? 'incident-item--selected' : ''}`} onClick={() => setSelectedIncident(incident.id)}>
                  <span className={`incident-icon incident-icon--${incident.severity}`}><Icon size={16} /></span>
                  <span className="incident-copy"><span className="incident-title-row"><strong>{incident.title}</strong><time>{incident.time}</time></span><span className="incident-location"><MapPin size={12} />{incident.location}</span><span className="incident-id">{incident.id}<i />{incident.severity === 'critical' ? 'Kritisch' : incident.severity === 'warning' ? 'Warnung' : 'Information'}</span></span>
                </button>
              })}
              {visibleIncidents.length === 0 && <p className="empty-state">Keine Meldungen in dieser Kategorie.</p>}
            </div>
            <button className="all-incidents-button">Alle Meldungen öffnen <ArrowUpRight size={14} /></button>
            <div className={`backend-card backend-card--${apiState}`}><div className="backend-card-icon"><Wifi size={16} /></div><div className="backend-card-copy"><strong>FastAPI Backend</strong><span>{apiMessage}</span><small>{lastChecked ? `Zuletzt geprüft ${lastChecked.toLocaleTimeString('de-DE')}` : 'Warte auf erste Prüfung'}</small></div><button onClick={() => void refreshBackend()} aria-label="Backend erneut prüfen" title="Backend erneut prüfen"><RefreshCw size={14} /></button><Check className="backend-check" size={15} /></div>
          </aside>
        </section>
        <footer className="status-footer"><span><span className={`footer-status-dot footer-status-dot--${apiState}`} /> Demo-Daten · Backend {apiState === 'online' ? 'verbunden' : apiState === 'offline' ? 'nicht erreichbar' : 'wird geprüft'}</span><span>RISKPILOT <i /> BUILD 0.1.0</span></footer>
      </main>
    </div>
  )
}

export default App
