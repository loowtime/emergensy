import { useState } from 'react'
import { AlertTriangle, CloudRain, Flame, MapPin, RefreshCw, Search, Shield, Trash2, Wifi, X } from 'lucide-react'
import type { ApiConnectionState, EventStatus, RiskEvent, Severity } from '../../types'
import './IncidentList.css'

type Props = {
  events: RiskEvent[]
  apiState: ApiConnectionState
  apiMessage: string
  lastChecked: Date | null
  deletingEventId: number | null
  onStatusChange: (event: RiskEvent, status: EventStatus) => void
  onDeleteEvent: (event: RiskEvent) => void
  onRefresh: () => void
}

const SEVERITY_FILTERS: { value: 'all' | Severity; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'critical', label: 'Kritisch' },
  { value: 'warning', label: 'Warnung' },
  { value: 'info', label: 'Niedrig' },
]

function categoryIcon(category: string) {
  switch (category) {
    case 'Brand': return Flame
    case 'Verkehr': return AlertTriangle
    case 'Wetter': return CloudRain
    default: return MapPin
  }
}

function severityLabel(severity: Severity): string {
  switch (severity) {
    case 'critical': return 'Kritisch'
    case 'warning': return 'Erhöht'
    case 'info': return 'Niedrig'
  }
}

function formatLastChecked(value: Date | null): string {
  return value ? `Zuletzt geprüft ${value.toLocaleTimeString('de-DE')}` : 'Warte auf erste Prüfung'
}

export function IncidentList({
  events,
  apiState,
  apiMessage,
  lastChecked,
  deletingEventId,
  onStatusChange,
  onDeleteEvent,
  onRefresh,
}: Props) {
  const [filter, setFilter] = useState<'all' | Severity>('all')
  const [search, setSearch] = useState('')
  const normalizedSearch = search.trim().toLocaleLowerCase('de-DE')
  const visibleEvents = events.filter((event) => {
    const matchesPriority = filter === 'all' || event.severity === filter
    const searchText = `${event.title} ${event.location} ${event.description} ${event.owner}`.toLocaleLowerCase('de-DE')
    return matchesPriority && searchText.includes(normalizedSearch)
  })
  const openCount = events.filter((event) => event.status !== 'resolved').length

  return (
    <aside className="incident-panel card" id="incidents">
      <div className="panel-heading incident-heading card-header">
        <div>
          <h2>Ereignisse</h2>
          <p><span className="incident-total">{openCount}</span> offen · {events.length} gesamt</p>
        </div>
      </div>
      <div className="filter-tabs nav nav-tabs" role="group" aria-label="Ereignisse nach Priorität filtern">
        {SEVERITY_FILTERS.map(({ value, label }) => {
          const count = value === 'all' ? events.length : events.filter((event) => event.severity === value).length
          return (
            <button
              key={value}
              className={filter === value ? 'filter-tab nav-link filter-tab--active' : 'filter-tab nav-link'}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label} <span>{count}</span>
            </button>
          )
        })}
      </div>
      <label className="event-search">
        <Search size={14} />
        <input className="form-control form-control-sm"
          value={search}
          onChange={(change) => setSearch(change.target.value)}
          placeholder="Suchen nach Ereignis oder Ort"
          aria-label="Ereignisse suchen"
        />
        {search && <button type="button" onClick={() => setSearch('')} aria-label="Suche löschen"><X size={13} /></button>}
      </label>
      <div className="incident-list">
        {visibleEvents.length === 0
          ? (
            <div className="empty-state">
              <Shield size={20} />
              <strong>{events.length === 0 ? 'Noch keine Ereignisse' : 'Keine Treffer'}</strong>
              <span>{events.length === 0 ? 'Erstelle ein Ereignis, um es hier zu verwalten.' : 'Passe Suche oder Prioritätsfilter an.'}</span>
            </div>
          )
          : visibleEvents.map((event) => {
            const Icon = categoryIcon(event.category)
            return (
              <article key={event.id} className="event-item">
                <span className={`incident-icon incident-icon--${event.severity}`}><Icon size={16} /></span>
                <div className="incident-copy">
                  <div className="incident-title-row"><strong>{event.title}</strong><time>#{event.id}</time></div>
                  <span className="incident-location"><MapPin size={12} />{event.location}</span>
                  {(typeof event.latitude !== 'number' || typeof event.longitude !== 'number') && (
                    <span className="legacy-location">Altbestand · ohne Kartenkoordinaten</span>
                  )}
                  <span className="event-description">{event.description}</span>
                  <div className="event-meta">
                    <span className={`severity-label badge severity-label--${event.severity}`}>{severityLabel(event.severity)}</span>
                    <span>{event.owner}</span>
                  </div>
                  <label className="status-control">
                    Status
                    <select className="form-select form-select-sm"
                      value={event.status}
                      onChange={(change) => onStatusChange(event, change.target.value as EventStatus)}
                    >
                      <option value="open">Offen</option>
                      <option value="monitoring">In Beobachtung</option>
                      <option value="resolved">Abgeschlossen</option>
                    </select>
                  </label>
                  <button
                    className="delete-event-button btn btn-outline-danger btn-sm"
                    type="button"
                    disabled={deletingEventId === event.id}
                    onClick={() => onDeleteEvent(event)}
                    aria-label={`Ereignis ${event.id} löschen`}
                  >
                    <Trash2 size={14} />
                    {deletingEventId === event.id ? 'Wird gelöscht …' : 'Ereignis löschen'}
                  </button>
                </div>
              </article>
            )
          })}
      </div>
      <div className={`backend-card backend-card--${apiState}`}>
        <div className="backend-card-icon"><Wifi size={16} /></div>
        <div className="backend-card-copy">
          <strong>FastAPI Backend</strong>
          <span>{apiMessage}</span>
          <small>{formatLastChecked(lastChecked)}</small>
        </div>
        <button type="button" onClick={onRefresh} disabled={apiState === 'checking'} aria-label="Backend erneut prüfen" title="Backend erneut prüfen">
          <RefreshCw size={14} className={apiState === 'checking' ? 'spin' : ''} />
        </button>
      </div>
    </aside>
  )
}
