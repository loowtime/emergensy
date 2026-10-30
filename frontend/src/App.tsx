import { useCallback, useEffect, useState } from 'react'
import { Activity, AlertTriangle, Check, Clock3, LogOut, Plus, RefreshCw, Shield, Siren, X } from 'lucide-react'
import { IconAlertTriangle, IconClipboardText, IconHome2, IconMap2 } from '@tabler/icons-react'
import { ApiError, loadEvents, loginAdmin, logoutAdmin, removeEvent, requestBackend, setEventStatus } from './api'
import { LoginPage } from './features/auth/LoginPage'
import { EventCreateDialog } from './features/events/EventCreateDialog'
import { IncidentList } from './features/events/IncidentList'
import { IncidentMap } from './features/events/IncidentMap'
import { SituationLogPanel } from './features/situation-log/SituationLogPanel'
import { StaffProtocolPage } from './features/staff-protocol/StaffProtocolPage'
import type { ApiConnectionState, EventStatus, RiskEvent } from './types'
import './App.css'

function App() {
  const [activePage, setActivePage] = useState<'overview' | 'protocol'>(() =>
    window.location.hash === '#situation-log' ? 'protocol' : 'overview',
  )
  const [token, setToken] = useState<string | null>(null)
  const [loginError, setLoginError] = useState('')
  const [apiState, setApiState] = useState<ApiConnectionState>(token ? 'checking' : 'offline')
  const [apiMessage, setApiMessage] = useState(token ? 'Verbindung wird geprüft' : 'Bitte anmelden')
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const [events, setEvents] = useState<RiskEvent[]>([])
  const [deletingEventId, setDeletingEventId] = useState<number | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    function syncPageFromLocation() {
      setActivePage(window.location.hash === '#situation-log' ? 'protocol' : 'overview')
    }
    window.addEventListener('hashchange', syncPageFromLocation)
    window.addEventListener('popstate', syncPageFromLocation)
    return () => {
      window.removeEventListener('hashchange', syncPageFromLocation)
      window.removeEventListener('popstate', syncPageFromLocation)
    }
  }, [])

  function navigateTo(target: 'overview' | 'protocol' | 'incidents' | 'map') {
    const hash = target === 'protocol'
      ? '#situation-log'
      : target === 'incidents' || target === 'map'
        ? `#${target}`
        : '#overview'
    window.history.pushState(null, '', hash)
    setActivePage(target === 'protocol' ? 'protocol' : 'overview')
    if (target === 'incidents' || target === 'map') {
      window.setTimeout(() => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth' }), 0)
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }
  const handleSessionExpired = useCallback(() => {
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
        <a className="brand-mark" href="#overview" aria-label="RiskPilot Startseite" onClick={(event) => { event.preventDefault(); navigateTo('overview') }}>
          <Shield size={22} strokeWidth={2.2} />
          <span>R</span>
        </a>
        <div className="rail-divider" />
        <a className={activePage === 'overview' ? 'rail-button rail-button--active' : 'rail-button'} href="#overview" title="Lageübersicht" aria-label="Lageübersicht" aria-current={activePage === 'overview' ? 'page' : undefined} onClick={(event) => { event.preventDefault(); navigateTo('overview') }}>
          <IconHome2 size={19} stroke={1.8} />
        </a>
        <a className="rail-button" href="#incidents" title="Einsatzmeldungen" aria-label="Einsatzmeldungen" onClick={(event) => { event.preventDefault(); navigateTo('incidents') }}>
          <IconAlertTriangle size={19} stroke={1.8} />
        </a>
        <a className="rail-button" href="#map" title="Lagekarte" aria-label="Lagekarte" onClick={(event) => { event.preventDefault(); navigateTo('map') }}>
          <IconMap2 size={19} stroke={1.8} />
        </a>
        <a className={activePage === 'protocol' ? 'rail-button rail-button--active' : 'rail-button'} href="#situation-log" title="Stabsprotokoll" aria-label="Stabsprotokoll" aria-current={activePage === 'protocol' ? 'page' : undefined} onClick={(event) => { event.preventDefault(); navigateTo('protocol') }}>
          <IconClipboardText size={19} stroke={1.8} />
        </a>
        <div className="rail-spacer" />
        <button className="avatar logout-avatar" title="Abmelden" aria-label="Abmelden" onClick={() => void handleLogout()}>
          <LogOut size={15} />
        </button>
      </aside>

      <main className="workspace" id={activePage === 'overview' ? 'overview' : 'staff-protocol'}>
        <header className="topbar">
          <div className="breadcrumb">
            <span>RISKPILOT</span>
            <span className="breadcrumb-slash">/</span>
            <strong>{activePage === 'protocol' ? 'Stabsprotokoll' : 'Einsatzübersicht'}</strong>
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

        {activePage === 'overview' ? (
          <>
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
          </>
        ) : (
          <StaffProtocolPage token={token} onSessionExpired={handleSessionExpired} onNotice={setNotice} />
        )}
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
