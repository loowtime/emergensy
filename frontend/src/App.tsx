import { useCallback, useEffect, useState } from 'react'
import { Activity, AlertTriangle, Check, ClipboardList, Clock3, Layers3, LogOut, MapPin, Plus, RefreshCw, Shield, Siren, X } from 'lucide-react'
import { ApiError, loadEvents, loginAdmin, logoutAdmin, removeEvent, requestBackend, setEventStatus } from './api'
import { LoginPage } from './features/auth/LoginPage'
import { EventCreateDialog } from './features/events/EventCreateDialog'
import { IncidentList } from './features/events/IncidentList'
import { IncidentMap } from './features/events/IncidentMap'
import { SituationLogPanel } from './features/situation-log/SituationLogPanel'
import type { ApiConnectionState, EventStatus, RiskEvent } from './types'
import './App.css'

function App() {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem('riskpilot-token'))
  const [loginError, setLoginError] = useState('')
  const [apiState, setApiState] = useState<ApiConnectionState>(token ? 'checking' : 'offline')
  const [apiMessage, setApiMessage] = useState(token ? 'Verbindung wird geprüft' : 'Bitte anmelden')
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
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
      if (error instanceof ApiError && error.status === 401) return handleSessionExpired()
      setApiMessage('Backend nicht erreichbar')
      setApiState('offline')
      setNotice(error instanceof Error ? error.message : 'Ereignisliste konnte nicht geladen werden.')
    })
    return () => { active = false }
  }, [handleSessionExpired, token])

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
      if (error instanceof ApiError && error.status === 401) return handleSessionExpired()
      setApiMessage('Backend nicht erreichbar')
      setApiState('offline')
      setNotice(error instanceof Error ? error.message : 'Aktualisieren fehlgeschlagen.')
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
      if (error instanceof ApiError && error.status === 401) return handleSessionExpired()
      setNotice(error instanceof Error ? error.message : 'Status konnte nicht gespeichert werden.')
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
      if (error instanceof ApiError && error.status === 401) return handleSessionExpired()
      setNotice(error instanceof Error ? error.message : 'Ereignis konnte nicht gelöscht werden.')
    } finally {
      setDeletingEventId(null)
    }
  }

  const openCount = events.filter((event) => event.status !== 'resolved').length
  const criticalCount = events.filter((event) => event.severity === 'critical' && event.status !== 'resolved').length
  const monitoringCount = events.filter((event) => event.status === 'monitoring').length
  const resolvedCount = events.filter((event) => event.status === 'resolved').length
  if (!token) return <LoginPage error={loginError} onLogin={handleLogin} />

  return (
    <div className="app-shell">
      <aside className="rail" aria-label="Hauptnavigation">
        <a className="brand-mark" href="#overview" aria-label="RiskPilot Startseite">
          <Shield size={22} strokeWidth={2.2} />
          <span>R</span>
        </a>
        <div className="rail-divider" />
        <a className="rail-button rail-button--active" href="#overview" title="Lageübersicht" aria-label="Lageübersicht" aria-current="page">
          <Layers3 size={19} />
        </a>
        <a className="rail-button" href="#incidents" title="Einsatzmeldungen" aria-label="Einsatzmeldungen">
          <Siren size={19} />
        </a>
        <a className="rail-button" href="#map" title="Lagekarte" aria-label="Lagekarte">
          <MapPin size={19} />
        </a>
        <a className="rail-button" href="#situation-log" title="Stabsprotokoll" aria-label="Stabsprotokoll">
          <ClipboardList size={19} />
        </a>
        <div className="rail-spacer" />
        <button className="avatar logout-avatar" title="Abmelden" aria-label="Abmelden" onClick={() => void handleLogout()}>
          <LogOut size={15} />
        </button>
      </aside>

      <main className="workspace" id="overview">
        <header className="topbar">
          <div className="breadcrumb">
            <span>RISKPILOT</span>
            <span className="breadcrumb-slash">/</span>
            <strong>Einsatzübersicht</strong>
          </div>
          <div className="topbar-right">
            <div className={`connection-pill connection-pill--${apiState}`}>
              <span className="connection-dot" />
              {apiState === 'online' ? 'API verbunden' : apiState === 'offline' ? 'API offline' : 'Prüfe API'}
            </div>
            <button className="profile-chip btn btn-link" onClick={() => void handleLogout()} aria-label="Admin abmelden">
              <span className="profile-avatar">AD</span>
              <span className="profile-name">Admin</span>
              <LogOut size={14} />
            </button>
          </div>
        </header>

        <section className="page-heading">
          <div>
            <div className="eyebrow"><span className="live-dot" /> FORSCHUNGSPROTOTYP · HAMBURG</div>
            <h1>Lageübersicht</h1>
            <p className="heading-subtitle">Strukturierte Erfassung und Auswertung von Ereignislagen.</p>
          </div>
          <div className="heading-actions">
            <span className="updated-label">
              <Clock3 size={14} />
              {lastChecked ? `Synchronisiert ${lastChecked.toLocaleTimeString('de-DE')}` : 'Ereignisse aus Backend'}
            </span>
            <button className="create-event-button btn btn-primary" onClick={() => setIsCreateOpen(true)}>
              <Plus size={15} /> Ereignis erstellen
            </button>
            <button className="refresh-button btn btn-outline-secondary" onClick={() => void refreshBackend()} disabled={apiState === 'checking'}>
              <RefreshCw size={15} className={apiState === 'checking' ? 'spin' : ''} /> Aktualisieren
            </button>
          </div>
        </section>

        <section className="metrics" aria-label="Lagekennzahlen">
          <article className="metric metric--urgent card">
            <div className="metric-top"><span>Offene Ereignisse</span><Siren size={17} /></div>
            <div className="metric-value">{openCount}</div>
            <div className="metric-foot">Noch nicht abgeschlossen</div>
          </article>
          <article className="metric card">
            <div className="metric-top"><span>Kritische Priorität</span><AlertTriangle size={17} /></div>
            <div className="metric-value">{criticalCount}</div>
            <div className="metric-foot">Offen oder in Bearbeitung</div>
          </article>
          <article className="metric card">
            <div className="metric-top"><span>In Beobachtung</span><Activity size={17} /></div>
            <div className="metric-value">{monitoringCount}</div>
            <div className="metric-foot">Laufende Überwachung</div>
          </article>
          <article className="metric card">
            <div className="metric-top"><span>Abgeschlossen</span><Check size={17} /></div>
            <div className="metric-value">{resolvedCount}</div>
            <div className="metric-foot">Erledigte Ereignisse</div>
          </article>
        </section>

        <section className="content-grid">
          <IncidentMap events={events} />

          <IncidentList
            events={events}
            apiState={apiState}
            apiMessage={apiMessage}
            lastChecked={lastChecked}
            deletingEventId={deletingEventId}
            onStatusChange={(event, status) => void handleStatusChange(event, status)}
            onDeleteEvent={(event) => void handleDeleteEvent(event)}
            onRefresh={() => void refreshBackend()}
          />
        </section>
        <SituationLogPanel token={token} events={events} onSessionExpired={handleSessionExpired} onNotice={setNotice} />
        <footer className="status-footer">
          <span><span className={`footer-status-dot footer-status-dot--${apiState}`} /> Daten lokal im Demonstrationsbetrieb gespeichert</span>
          <span>RISKPILOT <i /> FORSCHUNGSPROTOTYP</span>
        </footer>
        {notice && (
          <div className="notice alert alert-info" role="status">
            {notice}
            <button onClick={() => setNotice('')} aria-label="Hinweis schließen"><X size={14} /></button>
          </div>
        )}
        {isCreateOpen && (
          <EventCreateDialog
            token={token}
            onClose={() => setIsCreateOpen(false)}
            onCreated={(created) => {
              setEvents((current) => [created, ...current])
              setNotice(`Ereignis ${created.id} wurde angelegt.`)
            }}
            onSessionExpired={handleSessionExpired}
          />
        )}
      </main>
    </div>
  )
}

export default App
