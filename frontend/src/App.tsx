import { useEffect, useState, type FormEvent } from 'react'
import { Activity, AlertTriangle, Bell, Check, ChevronDown, Clock3, CloudRain, Crosshair, Flame, Layers3, LocateFixed, MapPin, Menu, Plus, RefreshCw, Search, Shield, Siren, Wifi, X } from 'lucide-react'
import L from 'leaflet'
import { MapContainer, Marker, Popup, TileLayer, ZoomControl } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import './App.css'

type Severity = 'critical' | 'warning' | 'info'
type Incident = { id: string; title: string; location: string; time: string; severity: Severity; coordinates: [number, number]; icon: typeof Flame }
type EventStatus = 'open' | 'monitoring' | 'resolved'
type RiskEvent = { id: number; title: string; category: string; severity: Severity; location: string; description: string; owner: string; status: EventStatus; created_at: string }
type EventDraft = Omit<RiskEvent, 'id' | 'status' | 'created_at'>

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

async function loadEvents(): Promise<RiskEvent[]> {
  const response = await fetch(`${API_URL}/api/events`)
  if (!response.ok) throw new Error('Ereignisse konnten nicht geladen werden')
  return response.json()
}

async function saveEvent(event: EventDraft): Promise<RiskEvent> {
  const response = await fetch(`${API_URL}/api/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(event) })
  if (!response.ok) throw new Error('Ereignis konnte nicht angelegt werden')
  return response.json()
}

async function setEventStatus(id: number, status: EventStatus): Promise<RiskEvent> {
  const response = await fetch(`${API_URL}/api/events/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
  if (!response.ok) throw new Error('Status konnte nicht aktualisiert werden')
  return response.json()
}

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
  const [search, setSearch] = useState('')
  const [events, setEvents] = useState<RiskEvent[]>([])
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const [draft, setDraft] = useState<EventDraft>({ title: '', category: 'Infrastruktur', severity: 'warning', location: '', description: '', owner: 'M. Keller' })

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
    loadEvents().then((items) => { if (active) setEvents(items) }).catch(() => { if (active) setNotice('Ereignisliste konnte nicht geladen werden.') })
    return () => { active = false }
  }, [])

  async function refreshBackend() {
    setApiState('checking')
    try {
      const [message, latestEvents] = await Promise.all([requestBackend(), loadEvents()])
      setEvents(latestEvents)
      setApiMessage(message)
      setApiState('online')
      setLastChecked(new Date())
    } catch {
      setApiMessage('Backend nicht erreichbar')
      setApiState('offline')
    }
  }

  async function handleCreateEvent(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault()
    setIsSaving(true)
    setFormError('')
    try {
      const created = await saveEvent(draft)
      setEvents((current) => [created, ...current])
      setDraft({ title: '', category: 'Infrastruktur', severity: 'warning', location: '', description: '', owner: 'M. Keller' })
      setIsCreateOpen(false)
      setNotice(`Ereignis ${created.id} wurde angelegt.`)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unbekannter Fehler beim Speichern.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleStatusChange(event: RiskEvent, status: EventStatus) {
    try {
      const updated = await setEventStatus(event.id, status)
      setEvents((current) => current.map((item) => item.id === updated.id ? updated : item))
      setNotice(`Status für „${updated.title}“ aktualisiert.`)
    } catch {
      setNotice('Status konnte nicht gespeichert werden. Bitte erneut versuchen.')
    }
  }

  const visibleEvents = events.filter((event) => {
    const matchesPriority = filter === 'all' || event.severity === filter
    const searchText = `${event.title} ${event.location} ${event.description} ${event.owner}`.toLocaleLowerCase('de-DE')
    return matchesPriority && searchText.includes(search.toLocaleLowerCase('de-DE'))
  })
  const openCount = events.filter((event) => event.status !== 'resolved').length
  const criticalCount = events.filter((event) => event.severity === 'critical' && event.status !== 'resolved').length
  const monitoringCount = events.filter((event) => event.status === 'monitoring').length
  const resolvedCount = events.filter((event) => event.status === 'resolved').length

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
              <div className="eyebrow"><span className="live-dot" /> RISIKOMANAGEMENT · EREIGNISLAGE</div>
            <h1>Lageübersicht</h1>
              <p className="heading-subtitle">Ereignisse, Prioritäten und Maßnahmen an einem Ort</p>
          </div>
          <div className="heading-actions">
              <span className="updated-label"><Clock3 size={14} />{lastChecked ? `Synchronisiert ${lastChecked.toLocaleTimeString('de-DE')}` : 'Ereignisse aus Backend'}</span>
              <button className="create-event-button" onClick={() => { setFormError(''); setIsCreateOpen(true) }}><Plus size={15} /> Ereignis erstellen</button>
            <button className="refresh-button" onClick={() => void refreshBackend()} disabled={apiState === 'checking'}><RefreshCw size={15} className={apiState === 'checking' ? 'spin' : ''} /> Aktualisieren</button>
          </div>
        </section>

        <section className="metrics" aria-label="Lagekennzahlen">
            <article className="metric metric--urgent"><div className="metric-top"><span>Offene Ereignisse</span><Siren size={17} /></div><div className="metric-value">{openCount}</div><div className="metric-foot">Noch nicht abgeschlossen</div></article>
            <article className="metric"><div className="metric-top"><span>Kritische Priorität</span><AlertTriangle size={17} /></div><div className="metric-value">{criticalCount}</div><div className="metric-foot">Offen oder in Bearbeitung</div></article>
            <article className="metric"><div className="metric-top"><span>In Beobachtung</span><Activity size={17} /></div><div className="metric-value">{monitoringCount}</div><div className="metric-foot">Laufende Überwachung</div></article>
            <article className="metric"><div className="metric-top"><span>Abgeschlossen</span><Check size={17} /></div><div className="metric-value">{resolvedCount}</div><div className="metric-foot">Erledigte Ereignisse</div></article>
        </section>

        <section className="content-grid">
          <article className="map-panel">
            <div className="panel-heading map-heading">
              <div><h2>Räumlicher Kontext</h2><p><span className="map-live-dot" /> Beispielmarker <span className="panel-separator">·</span> Berlin-Mitte</p></div>
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
            <div className="map-footer"><span><Crosshair size={14} /> Beispielkoordinaten · Berlin-Mitte</span><span>Marker dienen nur der Vorschau</span></div>
          </article>

          <aside className="incident-panel">
            <div className="panel-heading incident-heading"><div><h2>Ereignisse</h2><p><span className="incident-total">{openCount}</span> offen · {events.length} gesamt</p></div></div>
            <div className="filter-tabs" role="group" aria-label="Ereignisse nach Priorität filtern">
              <button className={filter === 'all' ? 'filter-tab filter-tab--active' : 'filter-tab'} onClick={() => setFilter('all')}>Alle <span>{events.length}</span></button>
              <button className={filter === 'critical' ? 'filter-tab filter-tab--active' : 'filter-tab'} onClick={() => setFilter('critical')}>Kritisch <span>{events.filter((event) => event.severity === 'critical').length}</span></button>
              <button className={filter === 'warning' ? 'filter-tab filter-tab--active' : 'filter-tab'} onClick={() => setFilter('warning')}>Warnung <span>{events.filter((event) => event.severity === 'warning').length}</span></button>
              <button className={filter === 'info' ? 'filter-tab filter-tab--active' : 'filter-tab'} onClick={() => setFilter('info')}>Niedrig <span>{events.filter((event) => event.severity === 'info').length}</span></button>
            </div>
            <label className="event-search"><Search size={14} /><input value={search} onChange={(change) => setSearch(change.target.value)} placeholder="Suchen nach Ereignis oder Ort" aria-label="Ereignisse suchen" />{search && <button onClick={() => setSearch('')} aria-label="Suche löschen"><X size={13} /></button>}</label>
            <div className="incident-list">
              {visibleEvents.map((event) => {
                const Icon = event.category === 'Brand' ? Flame : event.category === 'Verkehr' ? AlertTriangle : event.category === 'Wetter' ? CloudRain : MapPin
                return <article key={event.id} className="event-item">
                  <span className={`incident-icon incident-icon--${event.severity}`}><Icon size={16} /></span>
                  <div className="incident-copy">
                    <div className="incident-title-row"><strong>{event.title}</strong><time>#{event.id}</time></div>
                    <span className="incident-location"><MapPin size={12} />{event.location}</span>
                    <span className="event-description">{event.description}</span>
                    <div className="event-meta"><span className={`severity-label severity-label--${event.severity}`}>{event.severity === 'critical' ? 'Kritisch' : event.severity === 'warning' ? 'Erhöht' : 'Niedrig'}</span><span>{event.owner}</span></div>
                    <label className="status-control">Status <select value={event.status} onChange={(change) => void handleStatusChange(event, change.target.value as EventStatus)}><option value="open">Offen</option><option value="monitoring">In Beobachtung</option><option value="resolved">Abgeschlossen</option></select></label>
                  </div>
                </article>
              })}
              {visibleEvents.length === 0 && <div className="empty-state"><Shield size={20} /><strong>Keine Ereignisse</strong><span>Erstelle ein Ereignis, um es hier zu verwalten.</span></div>}
            </div>
            <div className={`backend-card backend-card--${apiState}`}><div className="backend-card-icon"><Wifi size={16} /></div><div className="backend-card-copy"><strong>FastAPI Backend</strong><span>{apiMessage}</span><small>{lastChecked ? `Zuletzt geprüft ${lastChecked.toLocaleTimeString('de-DE')}` : 'Warte auf erste Prüfung'}</small></div><button onClick={() => void refreshBackend()} aria-label="Backend erneut prüfen" title="Backend erneut prüfen"><RefreshCw size={14} /></button></div>
          </aside>
        </section>
        <footer className="status-footer"><span><span className={`footer-status-dot footer-status-dot--${apiState}`} /> Ereignisdaten werden persistent gespeichert</span><span>RISKPILOT <i /> BUILD 0.1.0</span></footer>
        {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Hinweis schließen"><X size={14} /></button></div>}
        {isCreateOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsCreateOpen(false) }}>
          <section className="event-modal" role="dialog" aria-modal="true" aria-labelledby="event-modal-title">
            <div className="modal-heading"><div><span className="modal-kicker">NEUER VORGANG</span><h2 id="event-modal-title">Ereignis erstellen</h2></div><button className="icon-button" onClick={() => setIsCreateOpen(false)} aria-label="Dialog schließen"><X size={18} /></button></div>
            <form className="event-form" onSubmit={(submitEvent) => void handleCreateEvent(submitEvent)}>
              <label>Titel<input autoFocus required minLength={3} maxLength={120} value={draft.title} onChange={(change) => setDraft({ ...draft, title: change.target.value })} placeholder="Kurz und eindeutig" /></label>
              <div className="form-row"><label>Kategorie<select value={draft.category} onChange={(change) => setDraft({ ...draft, category: change.target.value as EventDraft['category'] })}><option>Brand</option><option>Verkehr</option><option>Infrastruktur</option><option>Wetter</option><option>Sonstiges</option></select></label><label>Priorität<select value={draft.severity} onChange={(change) => setDraft({ ...draft, severity: change.target.value as Severity })}><option value="critical">Kritisch</option><option value="warning">Erhöht</option><option value="info">Niedrig</option></select></label></div>
              <label>Ort<input required minLength={3} maxLength={180} value={draft.location} onChange={(change) => setDraft({ ...draft, location: change.target.value })} placeholder="Adresse, Standort oder Bereich" /></label>
              <label>Beschreibung<textarea required minLength={5} maxLength={1200} rows={4} value={draft.description} onChange={(change) => setDraft({ ...draft, description: change.target.value })} placeholder="Was ist passiert? Welche Auswirkungen sind bekannt?" /></label>
              <label>Verantwortlich<input required minLength={2} maxLength={80} value={draft.owner} onChange={(change) => setDraft({ ...draft, owner: change.target.value })} /></label>
              {formError && <p className="form-error" role="alert">{formError}</p>}
              <div className="modal-actions"><button type="button" className="refresh-button" onClick={() => setIsCreateOpen(false)}>Abbrechen</button><button type="submit" className="create-event-button" disabled={isSaving}><Plus size={15} />{isSaving ? 'Wird gespeichert…' : 'Ereignis speichern'}</button></div>
            </form>
          </section>
        </div>}
      </main>
    </div>
  )
}

export default App
