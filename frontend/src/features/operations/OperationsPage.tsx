import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCheck,
  IconClock,
  IconDeviceFloppy,
  IconPrinter,
  IconPlus,
  IconRefresh,
  IconShieldCheck,
  IconTrash,
  IconUserCheck,
} from '@tabler/icons-react'
import { ApiError, loadOperationCommand, saveOperationCommand } from '../../api'
import type {
  CommandStaffCode,
  OperationCommandDocument,
  OperationCommandRecord,
  OperationAdvisor,
  OperationOrder,
  OperationReport,
  OperationStaffPosition,
  OperationPhase,
  RiskEvent,
} from '../../types'
import { formatSituationTimestamp } from '../situation-log/presentation'
import './OperationsPage.css'

type Props = {
  token: string
  events: RiskEvent[]
  onSessionExpired: () => void
  onNotice: (message: string) => void
}

const PHASES: { id: OperationPhase; title: string; subtitle: string }[] = [
  { id: 'situation', title: 'Lagefeststellung', subtitle: 'Erkundung, Kontrolle und Veränderungen erfassen' },
  { id: 'planning', title: 'Planung', subtitle: 'Ziele, Prioritäten und Optionen abgleichen' },
  { id: 'command', title: 'Befehlsgebung', subtitle: 'Aufträge, Mittel und Rückmeldungen klar zuordnen' },
  { id: 'control', title: 'Kontrolle', subtitle: 'Wirkung, Fortschritt und neue Lage prüfen' },
]

const STAFF_ROLES: { code: CommandStaffCode; title: string; responsibility: string }[] = [
  { code: 'S1', title: 'Personal / Innerer Dienst', responsibility: 'Personalstand, Ablösung und Stabsorganisation' },
  { code: 'S2', title: 'Lage', responsibility: 'Lagebild, Erkundung, Bewertung und Prognose' },
  { code: 'S3', title: 'Einsatz', responsibility: 'Einsatzplanung, Aufträge und Koordination' },
  { code: 'S4', title: 'Versorgung', responsibility: 'Versorgung, Material und Logistik' },
  { code: 'S5', title: 'Presse- und Medienarbeit', responsibility: 'Abgestimmte Information der Öffentlichkeit' },
  { code: 'S6', title: 'Information und Kommunikation', responsibility: 'Informations- und Kommunikationsverbindungen' },
]

function createDefaultDocument(): OperationCommandDocument {
  return {
    command_lead: '',
    phase: 'situation',
    situation_summary: '',
    mission: '',
    intent: '',
    next_review_at: null,
    phase_notes: { situation: '', planning: '', command: '', control: '' },
    staff_positions: STAFF_ROLES.map(({ code }) => ({
      code,
      owner: '',
      status: 'unassigned',
      focus: '',
    })),
    advisors: [],
    orders: [],
    reports: [],
  }
}

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
}

function toLocalDateTime(value: string): string {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function OperationsPage({ token, events, onSessionExpired, onNotice }: Props) {
  const [preferredEventId, setPreferredEventId] = useState<number | null>(null)
  const selectedEvent = useMemo(
    () => events.find((event) => event.id === preferredEventId)
      ?? events.find((event) => event.status !== 'resolved')
      ?? events[0]
      ?? null,
    [events, preferredEventId],
  )
  const [record, setRecord] = useState<OperationCommandRecord | null>(null)
  const [draft, setDraft] = useState<OperationCommandDocument>(createDefaultDocument)
  const [loadedEventId, setLoadedEventId] = useState<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [reportSource, setReportSource] = useState('')
  const [reportContent, setReportContent] = useState('')
  const [reportConfidence, setReportConfidence] = useState<'unverified' | 'verified'>('unverified')

  const handleError = useCallback((error: unknown, fallback: string) => {
    if (error instanceof ApiError && error.status === 401) {
      onSessionExpired()
    } else {
      onNotice(errorMessage(error, fallback))
    }
  }, [onNotice, onSessionExpired])

  const selectedEventId = selectedEvent?.id ?? null
  const isLoading = selectedEventId !== null && loadedEventId !== selectedEventId

  useEffect(() => {
    if (selectedEventId === null) return
    let active = true
    void loadOperationCommand(token, selectedEventId).then((loaded) => {
      if (!active) return
      setRecord(loaded)
      setDraft(loaded.document)
      setConflict(false)
    }).catch((error: unknown) => {
      if (active) handleError(error, 'Einsatzführung konnte nicht geladen werden.')
    }).finally(() => {
      if (active) setLoadedEventId(selectedEventId)
    })
    return () => { active = false }
  }, [handleError, selectedEventId, token])

  const openOrders = draft.orders.filter((order) => order.status !== 'completed')
  const supportNeeded = draft.staff_positions.filter((position) => position.status === 'support_needed').length
  const verifiedReports = draft.reports.filter((report) => report.confidence === 'verified').length

  function updateDraft<K extends keyof OperationCommandDocument>(key: K, value: OperationCommandDocument[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function updatePosition(code: CommandStaffCode, patch: Partial<OperationStaffPosition>) {
    updateDraft('staff_positions', draft.staff_positions.map((position) =>
      position.code === code ? { ...position, ...patch } : position,
    ))
  }

  function updateOrder(id: string, patch: Partial<OperationOrder>) {
    updateDraft('orders', draft.orders.map((order) => order.id === id ? { ...order, ...patch } : order))
  }

  function updateAdvisor(id: string, patch: Partial<OperationAdvisor>) {
    updateDraft('advisors', draft.advisors.map((advisor) =>
      advisor.id === id ? { ...advisor, ...patch } : advisor,
    ))
  }

  function addAdvisor() {
    updateDraft('advisors', [...draft.advisors, {
      id: newId('F'),
      organization: '',
      contact_person: '',
      focus: '',
      status: 'requested',
    }])
  }

  function addOrder() {
    const order: OperationOrder = {
      id: newId('A'),
      task: '',
      recipient: '',
      resources: '',
      reporting_point: '',
      due_at: null,
      status: 'open',
      feedback_required: true,
    }
    updateDraft('orders', [...draft.orders, order])
  }

  function addReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const report: OperationReport = {
      id: newId('L'),
      source: reportSource.trim(),
      content: reportContent.trim(),
      confidence: reportConfidence,
      reported_at: new Date().toISOString(),
    }
    updateDraft('reports', [report, ...draft.reports])
    setReportSource('')
    setReportContent('')
    setReportConfidence('unverified')
  }

  async function saveCommand() {
    if (!selectedEvent || !record) return
    if (draft.orders.some((order) => order.task.trim().length < 3 || order.recipient.trim().length < 2)) {
      onNotice('Jeder Auftrag benötigt eine Aufgabe und einen Empfänger.')
      return
    }
    if (draft.advisors.some((advisor) => advisor.organization.trim().length < 2)) {
      onNotice('Jede zusätzliche Fachberatung benötigt eine Organisation oder Stelle.')
      return
    }
    setIsSaving(true)
    try {
      const saved = await saveOperationCommand(token, selectedEvent.id, record.revision, draft)
      setRecord(saved)
      setDraft(saved.document)
      setIsEditing(false)
      setConflict(false)
      onNotice(`Einsatzführung für „${selectedEvent.title}“ gespeichert (Revision ${saved.revision}).`)
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) setConflict(true)
      handleError(error, 'Einsatzführung konnte nicht gespeichert werden.')
    } finally {
      setIsSaving(false)
    }
  }

  function cancelEditing() {
    if (record) setDraft(record.document)
    setIsEditing(false)
  }

  async function reloadAfterConflict() {
    if (!selectedEvent) return
    try {
      const current = await loadOperationCommand(token, selectedEvent.id)
      setRecord(current)
      setDraft(current.document)
      setConflict(false)
      setIsEditing(false)
      onNotice('Der aktuelle Führungsstand wurde geladen; nicht gespeicherte Änderungen wurden verworfen.')
    } catch (error) {
      handleError(error, 'Der aktuelle Führungsstand konnte nicht geladen werden.')
    }
  }

  const currentPhaseIndex = PHASES.findIndex((phase) => phase.id === draft.phase)

  return (
    <section className="operations-page" aria-labelledby="operations-title">
      <header className="operations-header">
        <div>
          <div className="operations-eyebrow"><IconShieldCheck size={15} /> EINSATZFÜHRUNG · FORSCHUNGSPROTOTYP</div>
          <h1 id="operations-title">Einsatzführung</h1>
          <p>Gemeinsamer Führungsrhythmus, klare Zuständigkeiten und überprüfbare Aufträge für die gewählte Lage.</p>
        </div>
        <div className="operations-actions">
          {selectedEvent && !isEditing && <button type="button" className="btn btn-outline-secondary" onClick={() => window.print()}><IconPrinter size={16} /> Lageübersicht drucken</button>}
          {selectedEvent && record && !isEditing && <button type="button" className="btn btn-primary" onClick={() => setIsEditing(true)}><IconRefresh size={16} /> Lage fortschreiben</button>}
          {isEditing && (
            <>
              <button type="button" className="btn btn-outline-secondary" onClick={cancelEditing}>Abbrechen</button>
              <button type="button" className="btn btn-primary" disabled={isSaving || isLoading} onClick={() => void saveCommand()}><IconDeviceFloppy size={16} />{isSaving ? 'Speichert …' : 'Führungsstand sichern'}</button>
            </>
          )}
        </div>
      </header>

      <div className="operations-safety-note" role="note">
        <IconAlertTriangle size={17} />
        <p><strong>Unterstützungsinstrument, keine Einsatzanweisung.</strong> Entscheidungen, Befehle und Prioritäten liegen bei der verantwortlichen Einsatzleitung. Angaben sind vor Verwendung fachlich zu prüfen.</p>
      </div>

      <section className="operations-event-bar card" aria-label="Gewählte Einsatzlage">
        <label className="form-label">Ereignis / Lage
          <select
            className="form-select"
            value={selectedEvent?.id ?? ''}
            disabled={isEditing || isLoading || events.length === 0}
            onChange={(event) => setPreferredEventId(Number(event.target.value))}
          >
            {events.length === 0 && <option value="">Noch keine Ereignisse erfasst</option>}
            {events.map((event) => <option key={event.id} value={event.id}>#{event.id} · {event.title} · {event.location}</option>)}
          </select>
        </label>
        {selectedEvent && (
          <div className="operations-event-facts">
            <span className={`operations-severity operations-severity--${selectedEvent.severity}`}>{selectedEvent.severity === 'critical' ? 'Kritisch' : selectedEvent.severity === 'warning' ? 'Warnung' : 'Information'}</span>
            <span>{selectedEvent.location}</span>
            <span>{selectedEvent.status === 'resolved' ? 'Abgeschlossen' : selectedEvent.status === 'monitoring' ? 'In Beobachtung' : 'Offen'}</span>
          </div>
        )}
      </section>

      {!selectedEvent ? (
        <section className="operations-empty card">
          <h2>Für die Einsatzführung wird ein Ereignis benötigt</h2>
          <p>Lege zuerst in der Lageübersicht ein Ereignis an. Danach kann hier der Führungsstand daran gebunden und fortgeschrieben werden.</p>
        </section>
      ) : (
        <>
          {conflict && (
            <div className="alert alert-warning operations-conflict" role="alert">
              <span>Eine andere Sitzung hat diesen Führungsstand fortgeschrieben. Deine Eingaben bleiben bis zum Neuladen sichtbar.</span>
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => void reloadAfterConflict()}>Aktuellen Stand laden</button>
            </div>
          )}
          <section className="operations-metrics" aria-label="Führungsstand">
            <article className="operations-metric card"><span>Führungsphase</span><strong>{PHASES[currentPhaseIndex]?.title}</strong><small>Führungsvorgang im Kreislauf</small></article>
            <article className="operations-metric card"><span>Offene Aufträge</span><strong>{openOrders.length}</strong><small>Rückmeldungen und Fristen verfolgen</small></article>
            <article className="operations-metric card"><span>Lagemeldungen</span><strong>{draft.reports.length}</strong><small>{verifiedReports} als verifiziert gekennzeichnet</small></article>
            <article className={`operations-metric card${supportNeeded ? ' operations-metric--attention' : ''}`}><span>Unterstützungsbedarf</span><strong>{supportNeeded}</strong><small>Führungsfunktionen mit Bedarfsmeldung</small></article>
          </section>

          <div className="operations-workspace">
            <div className="operations-main-column">
              <section className="operations-card card">
                <header className="operations-card-heading">
                  <div><span className="operations-section-number">01</span><div><h2>Führungsvorgang</h2><p>Lage feststellen → planen → beauftragen → kontrollieren; neue Erkenntnisse starten den Kreislauf erneut.</p></div></div>
                  {record?.revision ? <span className="badge text-bg-secondary">Revision {record.revision}</span> : <span className="badge text-bg-secondary">Entwurf</span>}
                </header>
                <div className="operations-phase-flow" aria-label="Führungsvorgang">
                  {PHASES.map((phase, index) => (
                    <button
                      type="button"
                      key={phase.id}
                      disabled={!isEditing}
                      aria-current={draft.phase === phase.id ? 'step' : undefined}
                      className={`operations-phase${draft.phase === phase.id ? ' operations-phase--active' : ''}${draft.phase_notes[phase.id].trim() ? ' operations-phase--documented' : ''}`}
                      onClick={() => updateDraft('phase', phase.id)}
                    >
                      <span>{String(index + 1).padStart(2, '0')}</span><strong>{phase.title}</strong><small>{phase.subtitle}</small>
                      {index < PHASES.length - 1 && <IconArrowRight size={16} aria-hidden="true" />}
                    </button>
                  ))}
                </div>
                <div className="operations-fields">
                  <label className="form-label">Einsatzleitung / verantwortliche Funktion
                    <input className="form-control" value={draft.command_lead} disabled={!isEditing} maxLength={120} placeholder="Name oder Funktion" onChange={(event) => updateDraft('command_lead', event.target.value)} />
                  </label>
                  <label className="form-label">Gemeinsame Lagezusammenfassung
                    <textarea className="form-control" rows={3} value={draft.situation_summary} disabled={!isEditing} maxLength={3000} placeholder="Zeitbezug, bestätigte Fakten, offene Annahmen und erkennbare Veränderungen trennen." onChange={(event) => updateDraft('situation_summary', event.target.value)} />
                  </label>
                  <div className="operations-fields-pair">
                    <label className="form-label">Auftrag / Einsatzauftrag
                      <textarea className="form-control" rows={3} value={draft.mission} disabled={!isEditing} maxLength={1000} placeholder="Was ist der Auftrag? In knapper, überprüfbarer Form festhalten." onChange={(event) => updateDraft('mission', event.target.value)} />
                    </label>
                    <label className="form-label">Führungsabsicht / Prioritäten
                      <textarea className="form-control" rows={3} value={draft.intent} disabled={!isEditing} maxLength={1500} placeholder="Ziele, Prioritäten und Abwägungen der Einsatzleitung dokumentieren." onChange={(event) => updateDraft('intent', event.target.value)} />
                    </label>
                  </div>
                  <div className="operations-phase-notes">
                    {PHASES.map((phase) => (
                      <label className={`form-label${draft.phase === phase.id ? ' operations-phase-note--active' : ''}`} key={phase.id}>
                        {phase.title}
                        <textarea className="form-control" rows={2} value={draft.phase_notes[phase.id]} disabled={!isEditing} maxLength={1500} placeholder={`Dokumentation: ${phase.subtitle.toLocaleLowerCase('de-DE')}.`} onChange={(event) => updateDraft('phase_notes', { ...draft.phase_notes, [phase.id]: event.target.value })} />
                      </label>
                    ))}
                  </div>
                  <label className="form-label operations-review-time">Nächster Lage-/Führungscheck
                    <input className="form-control" type="datetime-local" value={toLocalDateTime(draft.next_review_at ?? '')} disabled={!isEditing} onChange={(event) => updateDraft('next_review_at', event.target.value ? new Date(event.target.value).toISOString() : null)} />
                  </label>
                </div>
              </section>

              <section className="operations-card card">
                <header className="operations-card-heading">
                  <div><span className="operations-section-number">02</span><div><h2>Aufträge & Rückmeldungen</h2><p>Auftrag, Empfänger, benötigte Mittel und erwartete Rückmeldung gemeinsam sichtbar halten.</p></div></div>
                  {isEditing && <button type="button" className="btn btn-outline-secondary btn-sm" onClick={addOrder}><IconPlus size={15} /> Auftrag</button>}
                </header>
                <div className="operations-orders">
                  {draft.orders.map((order, index) => (
                    <article className="operations-order" key={order.id}>
                      <div className="operations-order-top"><span className="operations-section-number">{String(index + 1).padStart(2, '0')}</span><strong>{order.recipient || 'Empfänger offen'}</strong><span className={`operations-order-status operations-order-status--${order.status}`}>{order.status === 'completed' ? 'Erledigt' : order.status === 'in_progress' ? 'In Arbeit' : order.status === 'blocked' ? 'Blockiert' : 'Offen'}</span>{isEditing && <button type="button" className="btn btn-outline-secondary btn-sm operations-delete" aria-label="Auftrag entfernen" onClick={() => updateDraft('orders', draft.orders.filter((item) => item.id !== order.id))}><IconTrash size={15} /></button>}</div>
                      <div className="operations-fields-pair">
                        <label className="form-label">Auftrag / Aufgabe
                          <textarea className="form-control" rows={2} required disabled={!isEditing} maxLength={1000} value={order.task} placeholder="Konkreter Auftrag" onChange={(event) => updateOrder(order.id, { task: event.target.value })} />
                        </label>
                        <label className="form-label">Empfänger / Einheit
                          <input className="form-control" required disabled={!isEditing} maxLength={160} value={order.recipient} placeholder="Funktion, Gruppe oder Einheit" onChange={(event) => updateOrder(order.id, { recipient: event.target.value })} />
                        </label>
                      </div>
                      <div className="operations-fields-triple">
                        <label className="form-label">Mittel / Voraussetzungen
                          <input className="form-control" disabled={!isEditing} maxLength={500} value={order.resources} onChange={(event) => updateOrder(order.id, { resources: event.target.value })} />
                        </label>
                        <label className="form-label">Rückmeldepunkt
                          <input className="form-control" disabled={!isEditing} maxLength={500} value={order.reporting_point} onChange={(event) => updateOrder(order.id, { reporting_point: event.target.value })} />
                        </label>
                        <label className="form-label">Frist
                          <input className="form-control" type="datetime-local" disabled={!isEditing} value={toLocalDateTime(order.due_at ?? '')} onChange={(event) => updateOrder(order.id, { due_at: event.target.value ? new Date(event.target.value).toISOString() : null })} />
                        </label>
                      </div>
                      <div className="operations-order-controls">
                        <label className="form-label">Status
                          <select className="form-select" disabled={!isEditing} value={order.status} onChange={(event) => updateOrder(order.id, { status: event.target.value as OperationOrder['status'] })}>
                            <option value="open">Offen</option><option value="in_progress">In Arbeit</option><option value="completed">Erledigt</option><option value="blocked">Blockiert</option>
                          </select>
                        </label>
                        <label className="operations-check"><input type="checkbox" checked={order.feedback_required} disabled={!isEditing} onChange={(event) => updateOrder(order.id, { feedback_required: event.target.checked })} /> Rückmeldung erwartet</label>
                      </div>
                    </article>
                  ))}
                  {draft.orders.length === 0 && <p className="operations-empty-inline">Noch keine Aufträge dokumentiert. Aufträge bleiben der verantwortlichen Einsatzleitung vorbehalten.</p>}
                </div>
              </section>

              <section className="operations-card card">
                <header className="operations-card-heading">
                  <div><span className="operations-section-number">03</span><div><h2>Lagemeldungen</h2><p>Quelle und Verifizierungsstatus sichtbar halten; unbestätigte Angaben nicht als gesicherte Lage darstellen.</p></div></div>
                </header>
                {isEditing && (
                  <form className="operations-report-form" onSubmit={addReport}>
                    <label className="form-label">Quelle / meldende Funktion
                      <input className="form-control" required minLength={2} maxLength={160} value={reportSource} onChange={(event) => setReportSource(event.target.value)} placeholder="z. B. Erkundung, Leitstelle, Fachberatung" />
                    </label>
                    <label className="form-label">Meldung
                      <textarea className="form-control" required minLength={3} maxLength={1200} rows={2} value={reportContent} onChange={(event) => setReportContent(event.target.value)} placeholder="Beobachtung, Zeitpunkt und räumlichen Bezug festhalten." />
                    </label>
                    <label className="form-label">Verifikation
                      <select className="form-select" value={reportConfidence} onChange={(event) => setReportConfidence(event.target.value as OperationReport['confidence'])}>
                        <option value="unverified">Ungeprüft</option><option value="verified">Verifiziert</option>
                      </select>
                    </label>
                    <button type="submit" className="btn btn-outline-secondary"><IconPlus size={15} /> Meldung ergänzen</button>
                  </form>
                )}
                <div className="operations-reports">
                  {draft.reports.map((report) => (
                    <article className="operations-report" key={report.id}>
                      <div><strong>{report.source}</strong><span className={`operations-report-confidence operations-report-confidence--${report.confidence}`}>{report.confidence === 'verified' ? 'Verifiziert' : 'Ungeprüft'}</span><time>{formatSituationTimestamp(report.reported_at)}</time></div>
                      <p>{report.content}</p>
                      {isEditing && <button type="button" className="btn btn-link btn-sm" onClick={() => updateDraft('reports', draft.reports.filter((item) => item.id !== report.id))}>Meldung entfernen</button>}
                    </article>
                  ))}
                  {draft.reports.length === 0 && <p className="operations-empty-inline">Noch keine strukturierten Lagemeldungen. Quelle und Verifikation werden bei jeder Meldung mitgeführt.</p>}
                </div>
              </section>
            </div>

            <aside className="operations-side-column">
              <section className="operations-card card">
                <header className="operations-card-heading">
                  <div><span className="operations-section-number">04</span><div><h2>Führungsfunktionen</h2><p>Aufgabenbereiche besetzen oder Unterstützungsbedarf sichtbar machen.</p></div></div>
                </header>
                <div className="operations-staff-list">
                  {STAFF_ROLES.map((role) => {
                    const position = draft.staff_positions.find((item) => item.code === role.code)
                    if (!position) return null
                    return (
                      <article className="operations-staff-row" key={role.code}>
                        <div className="operations-staff-title"><strong>{role.code}</strong><div><b>{role.title}</b><small>{role.responsibility}</small></div></div>
                        <label className="form-label">Besetzung
                          <input className="form-control form-control-sm" value={position.owner} disabled={!isEditing} maxLength={120} placeholder="Funktion / Name" onChange={(event) => updatePosition(role.code, { owner: event.target.value })} />
                        </label>
                        <label className="form-label">Status
                          <select className="form-select form-select-sm" value={position.status} disabled={!isEditing} onChange={(event) => updatePosition(role.code, { status: event.target.value as OperationStaffPosition['status'] })}>
                            <option value="unassigned">Nicht besetzt</option><option value="active">Besetzt / aktiv</option><option value="support_needed">Unterstützung nötig</option>
                          </select>
                        </label>
                        <label className="form-label">Fokus / Hinweis
                          <input className="form-control form-control-sm" value={position.focus} disabled={!isEditing} maxLength={500} onChange={(event) => updatePosition(role.code, { focus: event.target.value })} />
                        </label>
                      </article>
                    )
                  })}
                </div>
              </section>

              <section className="operations-card card">
                <header className="operations-card-heading">
                  <div><span className="operations-section-number">05</span><div><h2>Fachberatung & Verbindung</h2><p>Benötigte Organisationen, Fachberatung und Verbindungen im Blick behalten.</p></div></div>
                  {isEditing && <button type="button" className="btn btn-outline-secondary btn-sm" onClick={addAdvisor}><IconPlus size={15} /> Kontakt</button>}
                </header>
                <div className="operations-advisors">
                  {draft.advisors.map((advisor) => (
                    <article className="operations-advisor" key={advisor.id}>
                      <div className="operations-advisor-heading"><IconUserCheck size={16} /><strong>{advisor.organization || 'Organisation / Fachberatung'}</strong>
                        {isEditing && <button type="button" className="btn btn-outline-secondary btn-sm operations-delete" aria-label="Kontakt entfernen" onClick={() => updateDraft('advisors', draft.advisors.filter((item) => item.id !== advisor.id))}><IconTrash size={15} /></button>}
                      </div>
                      <label className="form-label">Organisation / Stelle
                        <input className="form-control form-control-sm" value={advisor.organization} disabled={!isEditing} required maxLength={160} placeholder="z. B. Betreiber, Gesundheitsamt, Polizei" onChange={(event) => updateAdvisor(advisor.id, { organization: event.target.value })} />
                      </label>
                      <label className="form-label">Verbindung / Funktion
                        <input className="form-control form-control-sm" value={advisor.contact_person} disabled={!isEditing} maxLength={120} placeholder="Funktion, keine privaten Kontaktdaten" onChange={(event) => updateAdvisor(advisor.id, { contact_person: event.target.value })} />
                      </label>
                      <label className="form-label">Beratungs- oder Verbindungsbedarf
                        <input className="form-control form-control-sm" value={advisor.focus} disabled={!isEditing} maxLength={500} onChange={(event) => updateAdvisor(advisor.id, { focus: event.target.value })} />
                      </label>
                      <label className="form-label">Status
                        <select className="form-select form-select-sm" value={advisor.status} disabled={!isEditing} onChange={(event) => updateAdvisor(advisor.id, { status: event.target.value as OperationAdvisor['status'] })}>
                          <option value="requested">Angefragt</option><option value="connected">Verbunden</option><option value="not_required">Nicht erforderlich</option>
                        </select>
                      </label>
                    </article>
                  ))}
                  {draft.advisors.length === 0 && <p className="operations-empty-inline">Keine zusätzlichen Fachberatungen oder Verbindungspersonen erfasst.</p>}
                </div>
              </section>

              <section className="operations-reference card">
                <h2>Fachlicher Rahmen</h2>
                <p>Die Oberfläche orientiert sich am Führungsvorgang und an der Stabsorganisation der FwDV 100 (Ausgabe 1999). Sie bildet keine Hamburger Dienstanweisung ab. Vor realer Anwendung sind die aktuell gültigen örtlichen Vorgaben zu prüfen; Ausbildung und Verantwortung der Einsatzleitung bleiben maßgeblich.</p>
                <a href="https://www.idf.nrw.de/dokumente/wir-ueber-uns/aufgaben-des-idf/fwdv100.pdf" target="_blank" rel="noreferrer">FwDV 100 · Ausgabe 1999 · Institut der Feuerwehr NRW</a>
                <a href="https://www.bbk.bund.de/SharedDocs/Glossareintraege/DE/F/fuehrungsstab.html" target="_blank" rel="noreferrer">BBK-Glossar: Führungsstab</a>
                <a href="https://www.feuerwehr-hamburg.de/bereich/stab/" target="_blank" rel="noreferrer">Freiwillige Feuerwehr Hamburg · Bereich Stab</a>
              </section>
            </aside>
          </div>

          {record?.updated_at && <p className="operations-save-meta"><IconClock size={14} /> Zuletzt gesichert {formatSituationTimestamp(record.updated_at)} · Revision {record.revision}</p>}
          {isEditing && <div className="operations-bottom-actions"><span><IconCheck size={15} /> Änderungen werden erst nach dem Sichern übernommen.</span><button type="button" className="btn btn-primary" disabled={isSaving || isLoading} onClick={() => void saveCommand()}><IconDeviceFloppy size={16} />{isSaving ? 'Speichert …' : 'Führungsstand sichern'}</button></div>}
        </>
      )}
    </section>
  )
}
