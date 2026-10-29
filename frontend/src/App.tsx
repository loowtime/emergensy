import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Activity, AlertTriangle, Check, Clock3, CloudRain, Crosshair, Flame, Layers3, LocateFixed, LockKeyhole, LogOut, MapPin, Plus, RefreshCw, Search, Shield, Siren, Trash2, Wifi, X } from 'lucide-react'
import L from 'leaflet'
import { MapContainer, Marker, Popup, TileLayer, useMap, ZoomControl } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import './App.css'

type Severity = 'critical' | 'warning' | 'info'
type EventStatus = 'open' | 'monitoring' | 'resolved'
type RiskEvent = { id: number; title: string; category: string; severity: Severity; location: string; latitude: number | null; longitude: number | null; description: string; owner: string; status: EventStatus; created_at: string }
type EventDraft = Omit<RiskEvent, 'id' | 'status' | 'created_at'>
type OperationLocation = { address: string; label: string; coordinates: [number, number] }
type AddressSuggestion = { label: string; latitude: number; longitude: number }

const operationLocations: OperationLocation[] = [
  { address: 'Rathausmarkt 1, 20095 Hamburg', label: 'Rathausmarkt · Altstadt', coordinates: [53.5503, 9.9926] },
  { address: 'Glockengießerwall 5-7, 20095 Hamburg', label: 'Hauptbahnhof · St. Georg', coordinates: [53.5529, 10.0067] },
  { address: 'Platz der Deutschen Einheit 1, 20457 Hamburg', label: 'Elbphilharmonie · HafenCity', coordinates: [53.5413, 9.9843] },
  { address: 'Bei den St. Pauli-Landungsbrücken 5, 20359 Hamburg', label: 'Landungsbrücken · St. Pauli', coordinates: [53.5451, 9.9661] },
  { address: 'Paul-Nevermann-Platz 15, 22765 Hamburg', label: 'Bahnhof Altona · Altona', coordinates: [53.5528, 9.9356] },
]

const hamburgCenter: [number, number] = [53.5511, 9.9937]
const defaultLocation = operationLocations[0]

const markerIcons = Object.fromEntries(
  (['critical', 'warning', 'info'] as const).map((severity) => [severity, L.divIcon({
    className: 'incident-marker-shell',
    html: `<span class="incident-marker incident-marker--${severity}"><span></span></span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })]),
) as Record<Severity, L.DivIcon>

function MapInstanceBridge({ onReady }: { onReady: (map: L.Map) => void }) {
  const map = useMap()

  useEffect(() => onReady(map), [map, onReady])
  return null
}

const API_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000'

class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function loadEvents(token: string): Promise<RiskEvent[]> {
  const response = await fetch(`${API_URL}/api/events`, { headers: { Authorization: `Bearer ${token}` } })
  if (!response.ok) throw new ApiError('Ereignisse konnten nicht geladen werden', response.status)
  return response.json()
}

async function saveEvent(token: string, event: EventDraft): Promise<RiskEvent> {
  const response = await fetch(`${API_URL}/api/events`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(event) })
  if (!response.ok) throw new ApiError('Ereignis konnte nicht angelegt werden', response.status)
  return response.json()
}

async function setEventStatus(token: string, id: number, status: EventStatus): Promise<RiskEvent> {
  const response = await fetch(`${API_URL}/api/events/${id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
  if (!response.ok) throw new ApiError('Status konnte nicht aktualisiert werden', response.status)
  return response.json()
}

async function removeEvent(token: string, id: number): Promise<void> {
  const response = await fetch(`${API_URL}/api/events/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new ApiError('Ereignis konnte nicht gelöscht werden', response.status)
}

async function searchAddresses(token: string, query: string, signal: AbortSignal): Promise<AddressSuggestion[]> {
  const parameters = new URLSearchParams({ q: query })
  const response = await fetch(`${API_URL}/api/locations/search?${parameters}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  })
  if (!response.ok) throw new ApiError('Adressvorschläge konnten nicht geladen werden', response.status)
  const payload: { suggestions: AddressSuggestion[] } = await response.json()
  return payload.suggestions
}

async function loginAdmin(username: string, password: string): Promise<string> {
  let response: Response
  try {
    response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
  } catch {
    throw new Error('Backend nicht erreichbar. Bitte starte zuerst das Backend.')
  }
  if (response.status === 401) throw new Error('Benutzername oder Passwort falsch.')
  if (response.status === 429) throw new Error('Zu viele Fehlversuche. Die Anmeldung ist vorübergehend gesperrt; bitte später erneut versuchen.')
  if (response.status === 403) throw new Error('Der Demo-Login ist nur auf diesem Computer verfügbar.')
  if (!response.ok) throw new Error('Anmeldung fehlgeschlagen. Bitte Backend-Verbindung prüfen.')
  const payload: { access_token: string } = await response.json()
  return payload.access_token
}

async function requestBackend(): Promise<string> {
  const response = await fetch(`${API_URL}/`)
  if (!response.ok) throw new Error(`Backend antwortet mit ${response.status}`)
  const payload: { message?: string } = await response.json()
  return payload.message ?? 'Backend erreichbar'
}

function App() {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem('riskpilot-token'))
  const [loginName, setLoginName] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [apiState, setApiState] = useState<'checking' | 'online' | 'offline'>(token ? 'checking' : 'offline')
  const [apiMessage, setApiMessage] = useState(token ? 'Verbindung wird geprüft' : 'Bitte anmelden')
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const [filter, setFilter] = useState<'all' | Severity>('all')
  const [search, setSearch] = useState('')
  const [events, setEvents] = useState<RiskEvent[]>([])
  const [addressQuery, setAddressQuery] = useState(defaultLocation.address)
  const [selectedAddress, setSelectedAddress] = useState(defaultLocation.address)
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([])
  const [isSearchingAddress, setIsSearchingAddress] = useState(false)
  const [addressSearchError, setAddressSearchError] = useState('')
  const [deletingEventId, setDeletingEventId] = useState<number | null>(null)
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const [draft, setDraft] = useState<EventDraft>({ title: '', category: 'Infrastruktur', severity: 'warning', location: defaultLocation.address, latitude: defaultLocation.coordinates[0], longitude: defaultLocation.coordinates[1], description: '', owner: 'M. Keller' })
  const handleMapReady = useCallback((map: L.Map) => setMapInstance(map), [])

  useEffect(() => {
    if (!token) return

    let active = true
    Promise.all([requestBackend(), loadEvents(token)]).then(([message, items]) => {
      if (!active) return
      setApiMessage(message)
      setApiState('online')
      setLastChecked(new Date())
      setEvents(items)
    }).catch((error: unknown) => {
      if (!active) return
      if (error instanceof ApiError && error.status === 401) {
        sessionStorage.removeItem('riskpilot-token')
        setToken(null)
        setEvents([])
        setApiState('offline')
        setApiMessage('Bitte anmelden')
        setLoginError('Deine Sitzung ist abgelaufen. Bitte erneut anmelden.')
        return
      }
      setApiMessage('Backend nicht erreichbar')
      setApiState('offline')
      setNotice(error instanceof Error ? error.message : 'Ereignisliste konnte nicht geladen werden.')
    })
    return () => { active = false }
  }, [token])

  useEffect(() => {
    const query = addressQuery.trim()
    if (!token || query.length < 4 || query === selectedAddress) return

    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      setIsSearchingAddress(true)
      setAddressSearchError('')
      void searchAddresses(token, query, controller.signal).then((suggestions) => {
        setAddressSuggestions(suggestions)
        if (suggestions.length === 0) setAddressSearchError('Keine passenden Adressen in Hamburg gefunden.')
      }).catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (error instanceof ApiError && error.status === 401) {
          sessionStorage.removeItem('riskpilot-token')
          setToken(null)
          setEvents([])
          setApiState('offline')
          setApiMessage('Bitte anmelden')
          setLoginError('Deine Sitzung ist abgelaufen. Bitte erneut anmelden.')
        } else {
          setAddressSearchError(error instanceof Error ? error.message : 'Adresssuche fehlgeschlagen.')
        }
      }).finally(() => {
        if (!controller.signal.aborted) setIsSearchingAddress(false)
      })
    }, 700)

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [addressQuery, selectedAddress, token])

  async function refreshBackend() {
    if (!token) return
    setApiState('checking')
    try {
      const [message, latestEvents] = await Promise.all([requestBackend(), loadEvents(token)])
      setEvents(latestEvents)
      setApiMessage(message)
      setApiState('online')
      setLastChecked(new Date())
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        sessionStorage.removeItem('riskpilot-token')
        setToken(null)
        setEvents([])
        setApiState('offline')
        setApiMessage('Bitte anmelden')
        setLoginError('Deine Sitzung ist abgelaufen. Bitte erneut anmelden.')
      } else {
        setApiMessage('Backend nicht erreichbar')
        setApiState('offline')
        setNotice(error instanceof Error ? error.message : 'Aktualisieren fehlgeschlagen.')
      }
    }
  }

  async function handleLogin(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault()
    setIsLoggingIn(true)
    setLoginError('')
    try {
      const accessToken = await loginAdmin(loginName, loginPassword)
      sessionStorage.setItem('riskpilot-token', accessToken)
      setToken(accessToken)
      setLoginPassword('')
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Anmeldung fehlgeschlagen.')
    } finally {
      setIsLoggingIn(false)
    }
  }

  async function handleLogout() {
    let logoutWarning = ''
    if (token) {
      try {
        await fetch(`${API_URL}/api/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      } catch {
        logoutWarning = 'Server nicht erreichbar; die Sitzung läuft automatisch ab.'
      }
    }
    sessionStorage.removeItem('riskpilot-token')
    setToken(null)
    setEvents([])
    setApiState('offline')
    setApiMessage('Bitte anmelden')
    setLoginError(logoutWarning)
    setLoginPassword('')
  }

  async function handleCreateEvent(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault()
    if (!token) return
    setIsSaving(true)
    setFormError('')
    try {
      const created = await saveEvent(token, draft)
      setEvents((current) => [created, ...current])
      setDraft({ title: '', category: 'Infrastruktur', severity: 'warning', location: defaultLocation.address, latitude: defaultLocation.coordinates[0], longitude: defaultLocation.coordinates[1], description: '', owner: 'M. Keller' })
      setAddressQuery(defaultLocation.address)
      setSelectedAddress(defaultLocation.address)
      setAddressSuggestions([])
      setIsCreateOpen(false)
      setNotice(`Ereignis ${created.id} wurde angelegt.`)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        sessionStorage.removeItem('riskpilot-token')
        setToken(null)
        setEvents([])
        setApiState('offline')
        setApiMessage('Bitte anmelden')
        setLoginError('Deine Sitzung ist abgelaufen. Bitte erneut anmelden.')
      } else {
        setFormError(error instanceof Error ? error.message : 'Unbekannter Fehler beim Speichern.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  async function handleStatusChange(event: RiskEvent, status: EventStatus) {
    if (!token) return
    try {
      const updated = await setEventStatus(token, event.id, status)
      setEvents((current) => current.map((item) => item.id === updated.id ? updated : item))
      setNotice(`Status für „${updated.title}“ aktualisiert.`)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        sessionStorage.removeItem('riskpilot-token')
        setToken(null)
        setEvents([])
        setApiState('offline')
        setApiMessage('Bitte anmelden')
        setLoginError('Deine Sitzung ist abgelaufen. Bitte erneut anmelden.')
      } else {
        setNotice(error instanceof Error ? error.message : 'Status konnte nicht gespeichert werden.')
      }
    }
  }

  async function handleDeleteEvent(event: RiskEvent) {
    if (!token || !window.confirm(`Ereignis „${event.title}“ (#${event.id}) unwiderruflich löschen?`)) return
    setDeletingEventId(event.id)
    try {
      await removeEvent(token, event.id)
      setEvents((current) => current.filter((item) => item.id !== event.id))
      setNotice(`Ereignis „${event.title}“ wurde gelöscht.`)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        sessionStorage.removeItem('riskpilot-token')
        setToken(null)
        setEvents([])
        setApiState('offline')
        setApiMessage('Bitte anmelden')
        setLoginError('Deine Sitzung ist abgelaufen. Bitte erneut anmelden.')
      } else {
        setNotice(error instanceof Error ? error.message : 'Ereignis konnte nicht gelöscht werden.')
      }
    } finally {
      setDeletingEventId(null)
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
  const mappedEventCount = events.filter((event) => typeof event.latitude === 'number' && typeof event.longitude === 'number').length
  const unmappedEventCount = events.length - mappedEventCount

  if (!token) {
    return (
      <main className="login-page">
        <section className="login-story" aria-label="RiskPilot Hamburg">
          <a className="login-brand" href="#login" aria-label="RiskPilot">
            <span className="login-brand-mark"><Shield size={22} /><span>R</span></span>
            <span>RISKPILOT <small>HAMBURG</small></span>
          </a>
          <div className="login-story-copy">
            <span className="login-kicker"><span className="login-live-dot" /> LAGEZENTRUM · HAMBURG</span>
            <h1>Ein klarer Blick.<br />Wenn es darauf<br /><em>ankommt.</em></h1>
            <p>Ereignisse ordnen. Prioritäten erkennen. Maßnahmen im Blick behalten.</p>
          </div>
          <div className="login-story-footer"><span>53° 33′ N&nbsp;&nbsp; 9° 59′ E</span><span>LEITSTELLE HAMBURG</span></div>
        </section>
        <section className="login-side" id="login">
          <div className="login-panel">
            <span className="login-panel-index">ADMINISTRATIONSZUGANG <span>01 — 01</span></span>
            <div className="login-panel-icon"><LockKeyhole size={21} /></div>
            <h2>Willkommen zurück.</h2>
            <p className="login-intro">Melde dich an, um die Hamburger Ereignislage zu verwalten.</p>
            <form className="login-form" onSubmit={(submitEvent) => void handleLogin(submitEvent)}>
              <label>Benutzername<input autoComplete="username" required value={loginName} onChange={(change) => setLoginName(change.target.value)} placeholder="Benutzername" /></label>
              <label>Passwort<input autoComplete="current-password" required type="password" value={loginPassword} onChange={(change) => setLoginPassword(change.target.value)} placeholder="Passwort" /></label>
              {loginError && <p className="form-error" role="alert">{loginError}</p>}
              <button className="login-submit" type="submit" disabled={isLoggingIn}>
                {isLoggingIn ? 'Anmeldung läuft …' : 'Sicher anmelden'} <span>→</span>
              </button>
            </form>
            <div className="login-demo-note"><span className="login-demo-dot" /><span><strong>Lokaler Demo-Modus</strong><br />Standardzugang: admin / admin</span></div>
            <p className="login-security-note">Demo-Zugang ist nur lokal verfügbar. Nach fünf Fehlversuchen wird die Anmeldung für 15 Minuten gesperrt.</p>
          </div>
          <div className="login-side-footer"><span>RISKPILOT · EINSATZÜBERSICHT</span><span>VERSION 0.1</span></div>
        </section>
      </main>
    )
  }

  return (
    <div className="app-shell">
      <aside className="rail" aria-label="Hauptnavigation">
        <a className="brand-mark" href="#overview" aria-label="RiskPilot Startseite"><Shield size={22} strokeWidth={2.2} /><span>R</span></a>
        <div className="rail-divider" />
        <a className="rail-button rail-button--active" href="#overview" title="Lageübersicht" aria-label="Lageübersicht" aria-current="page"><Layers3 size={19} /></a>
        <a className="rail-button" href="#incidents" title="Einsatzmeldungen" aria-label="Einsatzmeldungen"><Siren size={19} /></a>
        <a className="rail-button" href="#map" title="Lagekarte" aria-label="Lagekarte"><MapPin size={19} /></a>
        <div className="rail-spacer" />
        <button className="avatar logout-avatar" title="Abmelden" aria-label="Abmelden" onClick={() => void handleLogout()}><LogOut size={15} /></button>
      </aside>

      <main className="workspace" id="overview">
        <header className="topbar">
          <div className="breadcrumb"><span>RISKPILOT</span><span className="breadcrumb-slash">/</span><strong>Einsatzübersicht</strong></div>
          <div className="topbar-right">
            <div className={`connection-pill connection-pill--${apiState}`}><span className="connection-dot" />{apiState === 'online' ? 'API verbunden' : apiState === 'offline' ? 'API offline' : 'Prüfe API'}</div>
            <button className="profile-chip" onClick={() => void handleLogout()} aria-label="M. Keller abmelden"><span className="profile-avatar">AD</span><span className="profile-name">Admin</span><LogOut size={14} /></button>
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
          <article className="map-panel" id="map">
            <div className="panel-heading map-heading">
              <div><h2>Lagekarte Hamburg</h2><p><span className="map-live-dot" /> {mappedEventCount} Ereignisse auf Karte <span className="panel-separator">·</span> Einsatzgebiet Hamburg</p></div>
              <div className="map-tools"><button className="map-tool" title="Karte zentrieren" aria-label="Karte zentrieren" disabled={!mapInstance} onClick={() => mapInstance?.setView(hamburgCenter, 12)}><LocateFixed size={16} /></button></div>
            </div>
            <div className="map-wrap">
              <MapContainer center={hamburgCenter} zoom={12} zoomControl={false} scrollWheelZoom className="incident-map">
                <MapInstanceBridge onReady={handleMapReady} />
                <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <ZoomControl position="bottomright" />
                {events.flatMap((event) => {
                  if (typeof event.latitude !== 'number' || typeof event.longitude !== 'number') return []
                  const coordinates: [number, number] = [event.latitude, event.longitude]
                  return [<Marker key={event.id} position={coordinates} icon={markerIcons[event.severity]}><Popup><strong>{event.title}</strong><br />{event.location}<br /><small>#{event.id} · {event.owner}</small></Popup></Marker>]
                })}
              </MapContainer>
              <div className="map-legend"><span><i className="legend-dot legend-dot--critical" /> Kritisch <b>{events.filter((event) => event.severity === 'critical').length}</b></span><span><i className="legend-dot legend-dot--warning" /> Warnung <b>{events.filter((event) => event.severity === 'warning').length}</b></span><span><i className="legend-dot legend-dot--info" /> Information <b>{events.filter((event) => event.severity === 'info').length}</b></span></div>
              <div className="map-scale">© OpenStreetMap-Mitwirkende</div>
            </div>
            <div className="map-footer"><span><Crosshair size={14} /> Einsatzgebiet Hamburg · freie Adresssuche</span><span>{unmappedEventCount ? `${unmappedEventCount} ältere Ereignisse ohne Kartenkoordinaten` : <><a href="https://photon.komoot.io/" target="_blank" rel="noreferrer">Photon</a> · OpenStreetMap</>}</span></div>
          </article>

          <aside className="incident-panel" id="incidents">
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
              <label>Einsatzadresse
                <div className="address-autocomplete">
                  <input
                    autoComplete="off"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={addressSuggestions.length > 0}
                    aria-controls="address-suggestions"
                    required
                    minLength={5}
                    maxLength={240}
                    value={addressQuery}
                    onChange={(change) => {
                      const value = change.target.value
                      setAddressQuery(value)
                      setSelectedAddress('')
                      setAddressSuggestions([])
                      setIsSearchingAddress(false)
                      setAddressSearchError('')
                      setDraft({ ...draft, location: value, latitude: null, longitude: null })
                    }}
                    placeholder="Adresse oder Ort in Hamburg eingeben"
                  />
                  {isSearchingAddress && <span className="address-search-spinner" aria-label="Adresssuche läuft" />}
                  {addressSuggestions.length > 0 && <div className="address-suggestions" id="address-suggestions" role="listbox" aria-label="Hamburger Adressvorschläge">
                    {addressSuggestions.map((suggestion) => <button key={`${suggestion.latitude}-${suggestion.longitude}-${suggestion.label}`} className="address-suggestion" type="button" role="option" aria-selected={selectedAddress === suggestion.label} onClick={() => {
                      setAddressQuery(suggestion.label)
                      setSelectedAddress(suggestion.label)
                      setAddressSuggestions([])
                      setAddressSearchError('')
                      setDraft({ ...draft, location: suggestion.label, latitude: suggestion.latitude, longitude: suggestion.longitude })
                    }}>
                      <MapPin size={15} /><span>{suggestion.label}</span>
                    </button>)}
                  </div>}
                </div>
                <span className="address-attribution">{addressSearchError || (draft.latitude !== null && draft.longitude !== null ? 'Kartenstandort ausgewählt' : 'Mindestens 4 Zeichen eingeben und einen Treffer auswählen')} · Suchtext wird an Photon übermittelt</span>
              </label>
              <label>Beschreibung<textarea required minLength={5} maxLength={1200} rows={4} value={draft.description} onChange={(change) => setDraft({ ...draft, description: change.target.value })} placeholder="Was ist passiert? Welche Auswirkungen sind bekannt?" /></label>
              <label>Verantwortlich<input required minLength={2} maxLength={80} value={draft.owner} onChange={(change) => setDraft({ ...draft, owner: change.target.value })} /></label>
              {formError && <p className="form-error" role="alert">{formError}</p>}
              <div className="modal-actions"><button type="button" className="refresh-button" onClick={() => setIsCreateOpen(false)}>Abbrechen</button><button type="submit" className="create-event-button" disabled={isSaving || draft.latitude === null || draft.longitude === null}><Plus size={15} />{isSaving ? 'Wird gespeichert…' : 'Ereignis speichern'}</button></div>
            </form>
          </section>
        </div>}
      </main>
    </div>
  )
}

export default App
