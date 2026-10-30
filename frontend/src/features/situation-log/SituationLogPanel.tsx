import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ClipboardList, Plus } from 'lucide-react'
import { ApiError, loadSituationLog, loadSituationReport, saveSituationLogEntry } from '../../api'
import type {
  RiskEvent,
  SituationLogEntry,
  SituationLogFilters,
  SituationLogType,
} from '../../types'
import { createPrintableSituationReport } from './printableReport'
import { formatSituationTimestamp, SITUATION_LOG_TYPE_LABELS } from './presentation'
import './SituationLogPanel.css'

const EMPTY_FILTERS: SituationLogFilters = {
  entryType: '',
  eventId: '',
  fromDate: '',
  toDate: '',
  query: '',
}

type Props = {
  token: string
  events: RiskEvent[]
  onSessionExpired: () => void
  onNotice: (message: string) => void
}

export function SituationLogPanel({ token, events, onSessionExpired, onNotice }: Props) {
  const [entries, setEntries] = useState<SituationLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [filters, setFilters] = useState<SituationLogFilters>(EMPTY_FILTERS)
  const [activeFilters, setActiveFilters] = useState<SituationLogFilters>(EMPTY_FILTERS)
  const [entryType, setEntryType] = useState<SituationLogType>('observation')
  const [author, setAuthor] = useState('Admin')
  const [eventId, setEventId] = useState('')
  const [content, setContent] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [reportTitle, setReportTitle] = useState('Stabsprotokoll')
  const [participants, setParticipants] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)

  const fetchPage = useCallback(async (appliedFilters: SituationLogFilters, pageOffset: number) => {
    try {
      const page = await loadSituationLog(token, appliedFilters, pageOffset)
      setEntries(page.entries)
      setTotal(page.total)
      setOffset(page.offset)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSessionExpired()
      } else {
        onNotice(error instanceof Error ? error.message : 'Protokollhistorie konnte nicht geladen werden.')
      }
    }
  }, [onNotice, onSessionExpired, token])

  useEffect(() => {
    let active = true
    void loadSituationLog(token, EMPTY_FILTERS, 0).then((page) => {
      if (!active) return
      setEntries(page.entries)
      setTotal(page.total)
      setOffset(page.offset)
    }).catch((error: unknown) => {
      if (!active) return
      if (error instanceof ApiError && error.status === 401) {
        onSessionExpired()
      } else {
        onNotice(error instanceof Error ? error.message : 'Protokollhistorie konnte nicht geladen werden.')
      }
    })
    return () => { active = false }
  }, [onNotice, onSessionExpired, token])

  async function handleCreateEntry(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault()
    setIsSaving(true)
    try {
      await saveSituationLogEntry(token, {
        entry_type: entryType,
        content,
        author,
        event_id: eventId ? Number(eventId) : null,
      })
      setContent('')
      setEventId('')
      await fetchPage(activeFilters, 0)
      onNotice('Eintrag im Stabsprotokoll gespeichert.')
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSessionExpired()
      } else {
        onNotice(error instanceof Error ? error.message : 'Stabseintrag konnte nicht gespeichert werden.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  async function handleFilter(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault()
    if (filters.fromDate && filters.toDate && filters.fromDate > filters.toDate) {
      onNotice('Das Startdatum muss vor dem Enddatum liegen.')
      return
    }
    const nextFilters = { ...filters }
    setActiveFilters(nextFilters)
    await fetchPage(nextFilters, 0)
  }

  async function handleGenerateReport() {
    const reportWindow = window.open('', '_blank')
    if (!reportWindow) {
      onNotice('Der Bericht wurde vom Browser blockiert. Bitte Pop-ups für diese lokale Anwendung erlauben.')
      return
    }
    setIsGenerating(true)
    reportWindow.document.write('<!doctype html><title>Bericht wird erstellt …</title><p style="font-family:sans-serif;padding:2rem">Bericht wird erstellt …</p>')
    try {
      const report = await loadSituationReport(token, activeFilters)
      reportWindow.document.open()
      reportWindow.document.write(createPrintableSituationReport(
        report,
        reportTitle.trim() || 'Stabsprotokoll',
        participants,
        activeFilters,
      ))
      reportWindow.document.close()
      reportWindow.focus()
      onNotice(`${report.total} Protokolleinträge für den Bericht geladen. Über „Drucken / als PDF speichern“ kann der Bericht exportiert werden.`)
    } catch (error) {
      reportWindow.close()
      if (error instanceof ApiError && error.status === 401) {
        onSessionExpired()
      } else {
        onNotice(error instanceof Error ? error.message : 'Bericht konnte nicht erstellt werden.')
      }
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <section className="situation-panel card" id="situation-log" aria-labelledby="situation-log-title">
      <div className="panel-heading situation-heading card-header">
        <div>
          <h2 id="situation-log-title">Stabsprotokoll</h2>
          <p><ClipboardList size={13} /> Lage, Entscheidungen, Maßnahmen, Ressourcen und Übergaben nachvollziehbar festhalten</p>
        </div>
        <span className="situation-count">{total} Einträge gesamt</span>
      </div>
      <div className="report-controls">
        <label className="form-label">Berichtstitel
          <input className="form-control form-control-sm" maxLength={120} value={reportTitle} onChange={(change) => setReportTitle(change.target.value)} />
        </label>
        <label className="form-label">Teilnehmende / Funktionen
          <input className="form-control form-control-sm" maxLength={300} value={participants} onChange={(change) => setParticipants(change.target.value)} placeholder="z. B. Einsatzleitung, Lage, Verbindung" />
        </label>
        <button type="button" className="create-event-button btn btn-primary" disabled={isGenerating} onClick={() => void handleGenerateReport()}>
          <ClipboardList size={15} />{isGenerating ? 'Bericht wird erstellt …' : 'Bericht erstellen / PDF'}
        </button>
      </div>
      <div className="situation-content">
        <form className="situation-form" onSubmit={(submitEvent) => void handleCreateEntry(submitEvent)}>
          <label className="form-label">Eintragstyp
            <select className="form-select form-select-sm" value={entryType} onChange={(change) => setEntryType(change.target.value as SituationLogType)}>
              <option value="observation">{SITUATION_LOG_TYPE_LABELS.observation}</option>
              <option value="decision">{SITUATION_LOG_TYPE_LABELS.decision}</option>
              <option value="measure">{SITUATION_LOG_TYPE_LABELS.measure}</option>
              <option value="resource">{SITUATION_LOG_TYPE_LABELS.resource}</option>
              <option value="handover">{SITUATION_LOG_TYPE_LABELS.handover}</option>
            </select>
          </label>
          <label className="form-label">Kürzel / Name
            <input className="form-control form-control-sm" required minLength={1} maxLength={80} value={author} onChange={(change) => setAuthor(change.target.value)} />
          </label>
          <label className="form-label">Bezug zu Ereignis
            <select className="form-select form-select-sm" value={eventId} onChange={(change) => setEventId(change.target.value)}>
              <option value="">Allgemeine Lage</option>
              {events.map((event) => <option key={event.id} value={event.id}>#{event.id} · {event.title}</option>)}
            </select>
          </label>
          <label className="form-label">Eintrag
            <textarea className="form-control form-control-sm" required minLength={1} maxLength={1200} rows={4} value={content} onChange={(change) => setContent(change.target.value)} placeholder="Sachlich festhalten: Was ist bekannt oder wurde entschieden?" />
          </label>
          <button className="create-event-button situation-submit btn btn-primary" type="submit" disabled={isSaving}>
            <Plus size={15} />{isSaving ? 'Wird gespeichert …' : 'Eintrag protokollieren'}
          </button>
          <p className="situation-note">Einträge werden mit Serverzeit gespeichert und können nicht nachträglich bearbeitet oder gelöscht werden. Das Kürzel wird manuell eingegeben.</p>
        </form>
        <div className="situation-history">
          <form className="situation-filters" onSubmit={(submitEvent) => void handleFilter(submitEvent)}>
            <label className="form-label">Suche
              <input className="form-control form-control-sm" maxLength={120} value={filters.query} onChange={(change) => setFilters({ ...filters, query: change.target.value })} placeholder="Text, Kürzel oder Ereignis" />
            </label>
            <label className="form-label">Eintragstyp
              <select className="form-select form-select-sm" value={filters.entryType} onChange={(change) => setFilters({ ...filters, entryType: change.target.value as SituationLogFilters['entryType'] })}>
                <option value="">Alle Typen</option>
                <option value="observation">{SITUATION_LOG_TYPE_LABELS.observation}</option>
                <option value="decision">{SITUATION_LOG_TYPE_LABELS.decision}</option>
                <option value="measure">{SITUATION_LOG_TYPE_LABELS.measure}</option>
                <option value="resource">{SITUATION_LOG_TYPE_LABELS.resource}</option>
                <option value="handover">{SITUATION_LOG_TYPE_LABELS.handover}</option>
              </select>
            </label>
            <label className="form-label">Ereignis
              <select className="form-select form-select-sm" value={filters.eventId} onChange={(change) => setFilters({ ...filters, eventId: change.target.value })}>
                <option value="">Alle Ereignisse</option>
                {events.map((event) => <option key={event.id} value={event.id}>#{event.id} · {event.title}</option>)}
              </select>
            </label>
            <label className="form-label">Von
              <input className="form-control form-control-sm" type="date" value={filters.fromDate} onChange={(change) => setFilters({ ...filters, fromDate: change.target.value })} />
            </label>
            <label className="form-label">Bis
              <input className="form-control form-control-sm" type="date" value={filters.toDate} onChange={(change) => setFilters({ ...filters, toDate: change.target.value })} />
            </label>
            <button className="refresh-button btn btn-outline-secondary btn-sm" type="submit">Historie filtern</button>
          </form>
          <div className="situation-feed" aria-live="polite">
            {entries.length === 0
              ? <div className="situation-empty"><ClipboardList size={20} /><strong>Keine passenden Stabseinträge</strong><span>Filter anpassen oder einen neuen Eintrag protokollieren.</span></div>
              : entries.map((entry) => (
                <article className="situation-entry" key={entry.id}>
                  <div className="situation-entry-top">
                    <span className={`situation-type badge situation-type--${entry.entry_type}`}>{SITUATION_LOG_TYPE_LABELS[entry.entry_type]}</span>
                    <time dateTime={entry.created_at}>{formatSituationTimestamp(entry.created_at)}</time>
                  </div>
                  <p>{entry.content}</p>
                  <div className="situation-entry-meta"><span>{entry.author}</span>{entry.event_id !== null && <span>Ereignis #{entry.event_id}{entry.event_title ? ` · ${entry.event_title}` : ' · nicht mehr aktiv'}</span>}</div>
                </article>
              ))}
          </div>
          <div className="situation-pagination">
            <span>{total === 0 ? '0' : `${offset + 1}–${Math.min(offset + entries.length, total)}`} von {total}</span>
            <div>
              <button type="button" className="refresh-button btn btn-outline-secondary btn-sm" disabled={offset === 0} onClick={() => void fetchPage(activeFilters, Math.max(0, offset - 50))}>Zurück</button>
              <button type="button" className="refresh-button btn btn-outline-secondary btn-sm" disabled={offset + 50 >= total} onClick={() => void fetchPage(activeFilters, offset + 50)}>Weitere Einträge</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
