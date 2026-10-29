import { useCallback, useEffect, useState } from 'react'
import { Activity, AlertTriangle, Check, ClipboardList, Clock3, CloudRain, Flame, Layers3, LogOut, MapPin, Plus, RefreshCw, Search, Shield, Siren, Trash2, Wifi, X } from 'lucide-react'
import { ApiError, loadEvents, loginAdmin, logoutAdmin, removeEvent, requestBackend, setEventStatus } from './api'
import { LoginPage } from './features/auth/LoginPage'
import { EventCreateDialog } from './features/events/EventCreateDialog'
import { IncidentMap } from './features/events/IncidentMap'
import { SituationLogPanel } from './features/situation-log/SituationLogPanel'
import type { EventStatus, RiskEvent, Severity } from './types'
import './App.css'

function App() {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem('riskpilot-token'))
  const [loginError, setLoginError] = useState('')
  const [apiState, setApiState] = useState<'checking' | 'online' | 'offline'>(token ? 'checking' : 'offline')
  const [apiMessage, setApiMessage] = useState(token ? 'Verbindung wird geprüft' : 'Bitte anmelden')
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const [filter, setFilter] = useState<'all' | Severity>('all')
  const [search, setSearch] = useState('')
  const [events, setEvents] = useState<RiskEvent[]>([])
  const [deletingEventId, setDeletingEventId] = useState<number | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const handleSessionExpired = useCallback(() => {
    sessionStorage.removeItem('riskpilot-token')
    setToken(null)
    setEvents([])
    setApiState('offline')
    setApiMessage('Bitte anmelden')
    setLoginError('Deine Sitzung ist abgelaufen. Bitte erneut anmelden.')
  }, [])

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

  async function handleLogin(username: string, password: string) {
    setLoginError('')
    try {
      const accessToken = await loginAdmin(username, password)
      sessionStorage.setItem('riskpilot-token', accessToken)
      setToken(accessToken)
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Anmeldung fehlgeschlagen.')
    }
  }

  async function handleLogout() {
    let logoutWarning = ''
    if (token) {
      try {
        await logoutAdmin(token)
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
  if (!token) return <LoginPage error={loginError} onLogin={handleLogin} />

  return (
    <div className="app-shell">
      <aside className="rail" aria-label="Hauptnavigation">
        <a className="brand-mark" href="#overview" aria-label="RiskPilot Startseite"><Shield size={22} strokeWidth={2.2} /><span>R</span></a>
        <div className="rail-divider" />
        <a className="rail-button rail-button--active" href="#overview" title="Lageübersicht" aria-label="Lageübersicht" aria-current="page"><Layers3 size={19} /></a>
        <a className="rail-button" href="#incidents" title="Einsatzmeldungen" aria-label="Einsatzmeldungen"><Siren size={19} /></a>
        <a className="rail-button" href="#map" title="Lagekarte" aria-label="Lagekarte"><MapPin size={19} /></a>
        <a className="rail-button" href="#situation-log" title="Stabsprotokoll" aria-label="Stabsprotokoll"><ClipboardList size={19} /></a>
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
              <button className="create-event-button" onClick={() => setIsCreateOpen(true)}><Plus size={15} /> Ereignis erstellen</button>
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
          <IncidentMap events={events} />

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
                    {(typeof event.latitude !== 'number' || typeof event.longitude !== 'number') && <span className="legacy-location">Altbestand · ohne Kartenkoordinaten</span>}
                    <span className="event-description">{event.description}</span>
                    <div className="event-meta"><span className={`severity-label severity-label--${event.severity}`}>{event.severity === 'critical' ? 'Kritisch' : event.severity === 'warning' ? 'Erhöht' : 'Niedrig'}</span><span>{event.owner}</span></div>
                    <label className="status-control">Status <select value={event.status} onChange={(change) => void handleStatusChange(event, change.target.value as EventStatus)}><option value="open">Offen</option><option value="monitoring">In Beobachtung</option><option value="resolved">Abgeschlossen</option></select></label>
                    <button className="delete-event-button" type="button" disabled={deletingEventId === event.id} onClick={() => void handleDeleteEvent(event)} aria-label={`Ereignis ${event.id} löschen`}><Trash2 size={14} />{deletingEventId === event.id ? 'Wird gelöscht …' : 'Ereignis löschen'}</button>
                  </div>
                </article>
              })}
              {visibleEvents.length === 0 && <div className="empty-state"><Shield size={20} /><strong>Keine Ereignisse</strong><span>Erstelle ein Ereignis, um es hier zu verwalten.</span></div>}
            </div>
            <div className={`backend-card backend-card--${apiState}`}><div className="backend-card-icon"><Wifi size={16} /></div><div className="backend-card-copy"><strong>FastAPI Backend</strong><span>{apiMessage}</span><small>{lastChecked ? `Zuletzt geprüft ${lastChecked.toLocaleTimeString('de-DE')}` : 'Warte auf erste Prüfung'}</small></div><button onClick={() => void refreshBackend()} aria-label="Backend erneut prüfen" title="Backend erneut prüfen"><RefreshCw size={14} /></button></div>
          </aside>
        </section>
        <SituationLogPanel token={token} events={events} onSessionExpired={handleSessionExpired} onNotice={setNotice} />
        <footer className="status-footer"><span><span className={`footer-status-dot footer-status-dot--${apiState}`} /> Ereignisdaten werden persistent gespeichert</span><span>RISKPILOT <i /> BUILD 0.1.0</span></footer>
        {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Hinweis schließen"><X size={14} /></button></div>}
        {isCreateOpen && token && <EventCreateDialog
          token={token}
          onClose={() => setIsCreateOpen(false)}
          onCreated={(created) => {
            setEvents((current) => [created, ...current])
            setNotice(`Ereignis ${created.id} wurde angelegt.`)
          }}
          onSessionExpired={handleSessionExpired}
        />}
      </main>
    </div>
  )
}

export default App
