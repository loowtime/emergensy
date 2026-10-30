import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  IconAlertTriangle,
  IconArrowDownToArc,
  IconCalendarEvent,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconClipboardCheck,
  IconClock,
  IconDeviceFloppy,
  IconEdit,
  IconHistory,
  IconPlus,
  IconShieldCheck,
  IconTrash,
  IconUsers,
  IconX,
} from '@tabler/icons-react'
import {
  ApiError,
  createStaffProtocol,
  loadStaffProtocol,
  loadStaffProtocolRevisions,
  loadStaffProtocols,
  updateStaffProtocol,
} from '../../api'
import type {
  StaffProtocolDecision,
  StaffProtocolDocument,
  StaffProtocolMeasure,
  StaffProtocolOpenPoint,
  StaffProtocolRecord,
  StaffProtocolRevision,
  StaffProtocolRisk,
  StaffProtocolTopic,
} from '../../types'
import { createPrintableStaffProtocol } from './printableStaffProtocol'
import { getRiskLevel } from './riskScoring'
import { formatSituationTimestamp } from '../situation-log/presentation'
import './StaffProtocolPage.css'

type Props = {
  token: string
  onSessionExpired: () => void
  onNotice: (message: string) => void
}

const LIST_LIMIT = 50
function localDateTime() {
  const now = new Date()
  return {
    date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
  }
}

function newProtocol(): StaffProtocolDocument {
  const { date, time } = localDateTime()
  return {
    title: 'Stabssitzung',
    meeting_date: date,
    meeting_time: time,
    session_lead: 'Admin',
    participants: '',
    recorder: 'Admin',
    occasion: '',
    situation_summary: '',
    risks: [],
    topics: [],
    decisions: [],
    measures: [],
    open_points: [],
  }
}

function createItemId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
}

function formatProtocolDate(value: string) {
  const parsed = new Date(`${value}T12:00:00`)
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString('de-DE', { dateStyle: 'medium' })
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

type InputFieldProps = {
  label: string
  value: string
  disabled: boolean
  onChange: (value: string) => void
  type?: string
  required?: boolean
  maxLength?: number
  placeholder?: string
  min?: string
}

function InputField({
  label,
  value,
  disabled,
  onChange,
  type = 'text',
  required = false,
  maxLength,
  placeholder,
  min,
}: InputFieldProps) {
  return (
    <label className="form-label protocol-field">
      {label}
      <input
        className="form-control form-control-sm"
        type={type}
        value={value}
        disabled={disabled}
        required={required}
        maxLength={maxLength}
        min={min}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

type TextareaFieldProps = Omit<InputFieldProps, 'type' | 'min'> & { rows?: number }

function TextareaField({ label, value, disabled, onChange, required, maxLength, placeholder, rows = 3 }: TextareaFieldProps) {
  return (
    <label className="form-label protocol-field">
      {label}
      <textarea
        className="form-control form-control-sm"
        value={value}
        disabled={disabled}
        required={required}
        maxLength={maxLength}
        placeholder={placeholder}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function SectionHeading({ number, title, description, action }: {
  number: string
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="protocol-section-heading">
      <span className="protocol-section-number">{number}</span>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {action && <div className="protocol-section-action">{action}</div>}
    </div>
  )
}

export function StaffProtocolPage({ token, onSessionExpired, onNotice }: Props) {
  const [records, setRecords] = useState<StaffProtocolRecord[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [currentRecord, setCurrentRecord] = useState<StaffProtocolRecord | null>(null)
  const [draft, setDraft] = useState<StaffProtocolDocument>(newProtocol)
  const [revisions, setRevisions] = useState<StaffProtocolRevision[]>([])
  const [selectedRevision, setSelectedRevision] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [isNew, setIsNew] = useState(false)
  const [conflict, setConflict] = useState(false)

  const handleError = useCallback((error: unknown, fallback: string) => {
    if (error instanceof ApiError && error.status === 401) {
      onSessionExpired()
    } else {
      onNotice(getErrorMessage(error, fallback))
    }
  }, [onNotice, onSessionExpired])

  const refreshRecords = useCallback(async (pageOffset: number) => {
    try {
      const page = await loadStaffProtocols(token, pageOffset)
      setRecords(page.records)
      setTotal(page.total)
      setOffset(page.offset)
    } catch (error) {
      handleError(error, 'Protokollhistorie konnte nicht geladen werden.')
    } finally {
      setIsLoading(false)
    }
  }, [handleError, token])

  useEffect(() => {
    let active = true
    void loadStaffProtocols(token, 0).then(async (page) => {
      if (!active) return
      setRecords(page.records)
      setTotal(page.total)
      setOffset(page.offset)
      const first = page.records[0]
      setCurrentRecord(first ?? null)
      setSelectedId(first?.id ?? null)
      setDraft(first?.protocol ?? newProtocol())
      setIsNew(false)
      setIsEditing(false)
      if (first) {
        const history = await loadStaffProtocolRevisions(token, first.id)
        if (!active) return
        setRevisions(history)
        setSelectedRevision(history[0]?.revision ?? null)
      }
    }).catch((error: unknown) => {
      if (active) handleError(error, 'Protokollhistorie konnte nicht geladen werden.')
    }).finally(() => {
      if (active) setIsLoading(false)
    })
    return () => { active = false }
  }, [handleError, token])

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('de-DE')
    if (!query) return records
    return records.filter(({ protocol }) =>
      `${protocol.title} ${protocol.occasion} ${protocol.session_lead} ${protocol.participants}`
        .toLocaleLowerCase('de-DE')
        .includes(query),
    )
  }, [records, search])

  const activeRevision = revisions.find((item) => item.revision === selectedRevision) ?? null
  const highRiskCount = draft.risks.filter((risk) => getRiskLevel(risk).score >= 10).length
  const openMeasureCount = draft.measures.filter((measure) => measure.status !== 'completed').length
  const openPointCount = draft.open_points.length

  function updateDraft<K extends keyof StaffProtocolDocument>(key: K, value: StaffProtocolDocument[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function startNewProtocol() {
    setCurrentRecord(null)
    setSelectedId(null)
    setDraft(newProtocol())
    setRevisions([])
    setSelectedRevision(null)
    setIsNew(true)
    setIsEditing(true)
    setConflict(false)
  }

  async function selectRecord(record: StaffProtocolRecord) {
    setCurrentRecord(record)
    setSelectedId(record.id)
    setDraft(record.protocol)
    setIsNew(false)
    setIsEditing(false)
    setConflict(false)
    setSelectedRevision(null)
    try {
      const history = await loadStaffProtocolRevisions(token, record.id)
      setRevisions(history)
      setSelectedRevision(history[0]?.revision ?? null)
    } catch (error) {
      handleError(error, 'Änderungshistorie konnte nicht geladen werden.')
    }
  }

  async function reloadAfterConflict() {
    if (selectedId === null) return
    try {
      const record = await loadStaffProtocol(token, selectedId)
      setCurrentRecord(record)
      setDraft(record.protocol)
      setConflict(false)
      setIsEditing(false)
      setRevisions(await loadStaffProtocolRevisions(token, record.id))
      onNotice('Die aktuelle Fassung wurde geladen.')
    } catch (error) {
      handleError(error, 'Aktuelle Protokollfassung konnte nicht geladen werden.')
    }
  }

  function cancelEdit() {
    if (isNew) {
      setCurrentRecord(null)
      setSelectedId(null)
      setDraft(newProtocol())
      setRevisions([])
      setSelectedRevision(null)
      setIsNew(false)
    } else if (currentRecord) {
      setDraft(currentRecord.protocol)
    }
    setConflict(false)
    setIsEditing(false)
  }

  async function saveProtocol(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault()
    setIsSaving(true)
    setConflict(false)
    try {
      const saved = isNew || !currentRecord
        ? await createStaffProtocol(token, draft)
        : await updateStaffProtocol(token, currentRecord.id, currentRecord.revision, draft)
      setCurrentRecord(saved)
      setSelectedId(saved.id)
      setDraft(saved.protocol)
      setIsNew(false)
      setIsEditing(false)
      setRevisions((current) => [
        {
          revision: saved.revision,
          changed_by: 'Admin',
          protocol: saved.protocol,
          created_at: saved.updated_at,
        },
        ...current.filter((item) => item.revision !== saved.revision),
      ])
      setSelectedRevision(saved.revision)
      setRecords((current) => {
        const remaining = current.filter((record) => record.id !== saved.id)
        return [saved, ...remaining].sort((a, b) =>
          `${b.protocol.meeting_date} ${b.protocol.meeting_time}`.localeCompare(`${a.protocol.meeting_date} ${a.protocol.meeting_time}`),
        )
      })
      setTotal((current) => isNew ? current + 1 : current)
      onNotice(isNew || !currentRecord ? 'Stabsprotokoll angelegt.' : `Protokollfassung ${saved.revision} gespeichert.`)
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setConflict(true)
      }
      handleError(error, 'Stabsprotokoll konnte nicht gespeichert werden.')
    } finally {
      setIsSaving(false)
    }
  }

  function exportProtocol() {
    if (!currentRecord || isEditing) return
    const reportWindow = window.open('', '_blank')
    if (!reportWindow) {
      onNotice('Der PDF-Export wurde vom Browser blockiert. Bitte Pop-ups für RiskPilot erlauben.')
      return
    }
    reportWindow.document.open()
    reportWindow.document.write(createPrintableStaffProtocol(currentRecord))
    reportWindow.document.close()
    reportWindow.focus()
    onNotice('Druckansicht geöffnet. Über „Drucken / als PDF speichern“ kann das Protokoll exportiert werden.')
  }

  function exportRevision() {
    if (!currentRecord || !activeRevision) return
    const reportWindow = window.open('', '_blank')
    if (!reportWindow) {
      onNotice('Der PDF-Export wurde vom Browser blockiert. Bitte Pop-ups für RiskPilot erlauben.')
      return
    }
    reportWindow.document.open()
    reportWindow.document.write(createPrintableStaffProtocol({
      ...currentRecord,
      revision: activeRevision.revision,
      protocol: activeRevision.protocol,
      updated_at: activeRevision.created_at,
    }))
    reportWindow.document.close()
    reportWindow.focus()
    onNotice(`Revision ${activeRevision.revision} zur Druckansicht geöffnet.`)
  }

  function patchRisk(id: string, patch: Partial<StaffProtocolRisk>) {
    updateDraft('risks', draft.risks.map((risk) => risk.id === id ? { ...risk, ...patch } : risk))
  }

  function patchTopic(id: string, patch: Partial<StaffProtocolTopic>) {
    updateDraft('topics', draft.topics.map((topic) => topic.id === id ? { ...topic, ...patch } : topic))
  }

  function patchDecision(id: string, patch: Partial<StaffProtocolDecision>) {
    updateDraft('decisions', draft.decisions.map((decision) => decision.id === id ? { ...decision, ...patch } : decision))
  }

  function patchMeasure(id: string, patch: Partial<StaffProtocolMeasure>) {
    updateDraft('measures', draft.measures.map((measure) => measure.id === id ? { ...measure, ...patch } : measure))
  }

  function patchOpenPoint(id: string, patch: Partial<StaffProtocolOpenPoint>) {
    updateDraft('open_points', draft.open_points.map((point) => point.id === id ? { ...point, ...patch } : point))
  }

  function addRisk() {
    const risk: StaffProtocolRisk = {
      id: createItemId('R'),
      title: '',
      probability: 3,
      impact: 3,
      response_plan: '',
    }
    updateDraft('risks', [...draft.risks, risk])
  }

  function addTopic() {
    updateDraft('topics', [...draft.topics, { id: createItemId('T'), title: '', findings: '' }])
  }

  function addDecision() {
    updateDraft('decisions', [...draft.decisions, {
      id: createItemId('D'),
      text: '',
      rationale: '',
      owner: '',
      risk_id: null,
    }])
  }

  function addMeasure() {
    updateDraft('measures', [...draft.measures, {
      id: createItemId('M'),
      task: '',
      owner: '',
      due_date: null,
      status: 'open',
      decision_id: null,
    }])
  }

  function addOpenPoint() {
    updateDraft('open_points', [...draft.open_points, {
      id: createItemId('O'),
      question: '',
      owner: '',
      follow_up_date: null,
    }])
  }

  const disabled = !isEditing

  return (
    <section className="staff-protocol-page" aria-labelledby="staff-protocol-title">
      <header className="staff-protocol-header">
        <div>
          <div className="protocol-eyebrow"><IconShieldCheck size={15} /> STABSARBEIT · LAGEZENTRUM HAMBURG</div>
          <h1 id="staff-protocol-title">Stabsprotokoll</h1>
          <p>Geführte Dokumentation von Lage, Risiken, Beschlüssen und operativen Maßnahmen.</p>
        </div>
        <div className="protocol-header-actions">
          {currentRecord && !isEditing && (
            <button type="button" className="btn btn-outline-secondary" onClick={exportProtocol}>
              <IconArrowDownToArc size={16} /> PDF / Drucken
            </button>
          )}
          {currentRecord && !isEditing && (
            <button type="button" className="btn btn-outline-secondary" onClick={() => setIsEditing(true)}>
              <IconEdit size={16} /> Bearbeiten
            </button>
          )}
          {isEditing && (
            <button type="button" className="btn btn-outline-secondary" onClick={cancelEdit}>
              <IconX size={16} /> Abbrechen
            </button>
          )}
          {isEditing && (
            <button type="submit" form="staff-protocol-form" className="btn btn-primary" disabled={isSaving}>
              <IconDeviceFloppy size={16} /> {isSaving ? 'Speichert …' : 'Protokoll speichern'}
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={startNewProtocol}>
            <IconPlus size={16} /> Neue Sitzung
          </button>
        </div>
      </header>

      <section className="protocol-overview-grid datagrid" aria-label="Kennzahlen der aktuellen Sitzung">
        <article className="protocol-kpi datagrid-item">
          <span className="protocol-kpi-label"><IconAlertTriangle size={15} /> Hohe Risiken</span>
          <strong>{highRiskCount}</strong>
          <small>hoch oder kritisch bewertet</small>
        </article>
        <article className="protocol-kpi datagrid-item">
          <span className="protocol-kpi-label"><IconClipboardCheck size={15} /> Offene Maßnahmen</span>
          <strong>{openMeasureCount}</strong>
          <small>mit Zuständigkeit nachverfolgen</small>
        </article>
        <article className="protocol-kpi datagrid-item">
          <span className="protocol-kpi-label"><IconHistory size={15} /> Offene Punkte</span>
          <strong>{openPointCount}</strong>
          <small>für nächste Lagebesprechung</small>
        </article>
        <article className="protocol-kpi datagrid-item">
          <span className="protocol-kpi-label"><IconCalendarEvent size={15} /> Dokumentierte Sitzungen</span>
          <strong>{total}</strong>
          <small>mit nachvollziehbarem Revisionsstand</small>
        </article>
      </section>

      <div className="protocol-workspace">
        <aside className="protocol-sidebar card" aria-label="Protokollhistorie">
          <div className="card-header protocol-sidebar-header">
            <div><IconHistory size={17} /><strong>Protokollhistorie</strong></div>
            <span className="badge text-bg-secondary">{total}</span>
          </div>
          <div className="protocol-history-search">
            <input
              className="form-control form-control-sm"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Sitzung suchen"
              aria-label="Protokollhistorie durchsuchen"
            />
          </div>
          <div className="protocol-session-list" aria-live="polite">
            {isLoading
              ? <p className="protocol-history-empty">Protokolle werden geladen …</p>
              : filteredRecords.length === 0
                ? <p className="protocol-history-empty">{records.length === 0 ? 'Noch keine Sitzungen dokumentiert.' : 'Keine passenden Sitzungen.'}</p>
                : filteredRecords.map((record) => (
                  <button
                    className={selectedId === record.id ? 'protocol-session-row protocol-session-row--active' : 'protocol-session-row'}
                    key={record.id}
                    type="button"
                    onClick={() => void selectRecord(record)}
                  >
                    <span className="protocol-session-row-top">
                      <strong>{record.protocol.title}</strong>
                      <span>R{record.revision}</span>
                    </span>
                    <span>{formatProtocolDate(record.protocol.meeting_date)} · {record.protocol.meeting_time} Uhr</span>
                    <small>{record.protocol.session_lead} · {record.protocol.occasion}</small>
                  </button>
                ))}
          </div>
          <div className="protocol-history-pagination">
            <span>{total === 0 ? '0' : `${offset + 1}–${Math.min(offset + records.length, total)} von ${total}`}</span>
            <div>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                aria-label="Vorherige Protokolle"
                disabled={offset === 0 || isLoading}
                onClick={() => { setIsLoading(true); void refreshRecords(Math.max(0, offset - LIST_LIMIT)) }}
              ><IconChevronLeft size={15} /></button>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                aria-label="Weitere Protokolle"
                disabled={offset + LIST_LIMIT >= total || isLoading}
                onClick={() => { setIsLoading(true); void refreshRecords(offset + LIST_LIMIT) }}
              ><IconChevronRight size={15} /></button>
            </div>
          </div>
          {selectedId !== null && revisions.length > 0 && (
            <div className="protocol-revisions">
              <div className="protocol-revisions-heading"><IconHistory size={15} /> Fassungen</div>
              {revisions.map((revision) => (
                <button
                  type="button"
                  key={revision.revision}
                  className={selectedRevision === revision.revision ? 'protocol-revision protocol-revision--active' : 'protocol-revision'}
                  onClick={() => setSelectedRevision(revision.revision)}
                >
                  <span><strong>Revision {revision.revision}</strong>{revision.revision === currentRecord?.revision && <span className="badge text-bg-primary">Aktuell</span>}</span>
                  <small>{formatSituationTimestamp(revision.created_at)} · {revision.changed_by}</small>
                </button>
              ))}
              {activeRevision && (
                <div className="protocol-revision-summary">
                  <strong>{activeRevision.protocol.title}</strong>
                  <span>{activeRevision.protocol.risks.length} Risiken · {activeRevision.protocol.decisions.length} Beschlüsse · {activeRevision.protocol.measures.length} Maßnahmen</span>
                  <small>{activeRevision.protocol.situation_summary || 'Keine Lagezusammenfassung in dieser Fassung.'}</small>
                  <button type="button" className="btn btn-link btn-sm" onClick={exportRevision}>Fassung als PDF / Druck öffnen</button>
                </div>
              )}
            </div>
          )}
        </aside>

        <form id="staff-protocol-form" className="protocol-document" onSubmit={(event) => void saveProtocol(event)}>
          {conflict && (
            <div className="alert alert-warning protocol-conflict" role="alert">
              <span>Eine neuere Fassung wurde zwischenzeitlich gespeichert. Deine Eingaben bleiben vorerst erhalten.</span>
              <button className="btn btn-outline-secondary btn-sm" type="button" onClick={() => void reloadAfterConflict()}>Aktuelle Fassung laden</button>
            </div>
          )}
          <section className="protocol-section card">
            <div className="card-header">
              <SectionHeading
                number="01"
                title="Sitzungsinformationen"
                description="Rahmen, Leitung und Anlass der Lagebesprechung"
                action={currentRecord && <span className="badge text-bg-secondary">Revision {currentRecord.revision}</span>}
              />
            </div>
            <div className="card-body protocol-section-body">
              <div className="protocol-fields-grid">
                <InputField label="Sitzungstitel" value={draft.title} disabled={disabled} required maxLength={160} onChange={(value) => updateDraft('title', value)} />
                <InputField label="Datum" type="date" value={draft.meeting_date} disabled={disabled} required onChange={(value) => updateDraft('meeting_date', value)} />
                <InputField label="Uhrzeit" type="time" value={draft.meeting_time} disabled={disabled} required onChange={(value) => updateDraft('meeting_time', value)} />
                <InputField label="Sitzungsleitung" value={draft.session_lead} disabled={disabled} required maxLength={120} onChange={(value) => updateDraft('session_lead', value)} />
                <InputField label="Protokollführung" value={draft.recorder} disabled={disabled} required maxLength={120} onChange={(value) => updateDraft('recorder', value)} />
                <InputField label="Teilnehmende / Funktionen" value={draft.participants} disabled={disabled} maxLength={2000} placeholder="z. B. Einsatzleitung, Lage, Verbindung" onChange={(value) => updateDraft('participants', value)} />
                <div className="protocol-field protocol-field--wide">
                  <TextareaField label="Anlass" value={draft.occasion} disabled={disabled} required maxLength={1200} rows={2} placeholder="Auslöser und Ziel der Stabssitzung" onChange={(value) => updateDraft('occasion', value)} />
                </div>
              </div>
              <div className="protocol-save-meta">
                <span><IconClock size={14} /> {currentRecord ? `Zuletzt gespeichert ${formatSituationTimestamp(currentRecord.updated_at)}` : 'Noch nicht gespeichert'}</span>
                <span><IconUsers size={14} /> {draft.participants.trim() ? 'Teilnehmende erfasst' : 'Teilnehmende optional'}</span>
              </div>
            </div>
          </section>

          <section className="protocol-section card">
            <div className="card-header">
              <SectionHeading number="02" title="Aktuelle Lage" description="Sachstand und für den Stab relevante Veränderungen" />
            </div>
            <div className="card-body protocol-section-body">
              <TextareaField
                label="Lagezusammenfassung"
                value={draft.situation_summary}
                disabled={disabled}
                maxLength={4000}
                rows={4}
                placeholder="Was ist bekannt, was hat sich verändert und welche Auswirkungen sind absehbar?"
                onChange={(value) => updateDraft('situation_summary', value)}
              />
            </div>
          </section>

          <section className="protocol-section card">
            <div className="card-header">
              <SectionHeading
                number="03"
                title="Risikobewertung"
                description="Eintritt × Auswirkung; Stufe wird transparent aus der 5×5-Matrix berechnet"
                action={isEditing && <button className="btn btn-outline-secondary btn-sm" type="button" onClick={addRisk}><IconPlus size={15} /> Risiko</button>}
              />
            </div>
            <div className="table-responsive protocol-table-wrap">
              <table className="table table-vcenter protocol-table">
                <thead><tr><th>Risiko-ID / Risiko</th><th>Eintritt (1–5)</th><th>Auswirkung (1–5)</th><th>Stufe</th><th>Vorsorge / Reaktion</th>{isEditing && <th aria-label="Aktionen" />}</tr></thead>
                <tbody>
                  {draft.risks.map((risk) => {
                    const level = getRiskLevel(risk)
                    return (
                      <tr key={risk.id}>
                        <td><span className="protocol-item-id">{risk.id}</span><input className="form-control form-control-sm" value={risk.title} required disabled={disabled} maxLength={180} placeholder="Risiko beschreiben" onChange={(event) => patchRisk(risk.id, { title: event.target.value })} /></td>
                        <td><select className="form-select form-select-sm" value={risk.probability} disabled={disabled} aria-label={`Eintrittswahrscheinlichkeit ${risk.id}`} onChange={(event) => patchRisk(risk.id, { probability: Number(event.target.value) })}>{[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>{score} · {['Sehr gering', 'Gering', 'Mittel', 'Hoch', 'Sehr hoch'][score - 1]}</option>)}</select></td>
                        <td><select className="form-select form-select-sm" value={risk.impact} disabled={disabled} aria-label={`Schadensausmaß ${risk.id}`} onChange={(event) => patchRisk(risk.id, { impact: Number(event.target.value) })}>{[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>{score} · {['Gering', 'Begrenzt', 'Erheblich', 'Schwer', 'Existenzbedrohend'][score - 1]}</option>)}</select></td>
                        <td><span className={`risk-level risk-level--${level.className}`}><i />{level.label}<small>{level.score}/25</small></span></td>
                        <td><input className="form-control form-control-sm" value={risk.response_plan} disabled={disabled} maxLength={1200} placeholder="Vorsorge oder Reaktion" onChange={(event) => patchRisk(risk.id, { response_plan: event.target.value })} /></td>
                        {isEditing && <td><button className="btn btn-outline-secondary btn-sm protocol-remove-button" type="button" aria-label={`${risk.id} entfernen`} onClick={() => {
                          updateDraft('risks', draft.risks.filter((item) => item.id !== risk.id))
                          updateDraft('decisions', draft.decisions.map((decision) => decision.risk_id === risk.id ? { ...decision, risk_id: null } : decision))
                        }}><IconTrash size={15} /></button></td>}
                      </tr>
                    )
                  })}
                  {draft.risks.length === 0 && <tr><td colSpan={isEditing ? 6 : 5} className="protocol-table-empty">Noch keine Risiken bewertet.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="risk-matrix-note"><IconAlertTriangle size={14} /> Bewertungsmatrix: 1–4 niedrig · 5–9 beobachten · 10–15 hoch · 16–25 kritisch</div>
          </section>

          <section className="protocol-section card">
            <div className="card-header">
              <SectionHeading number="04" title="Besprochene Themen" description="Tagesordnungspunkte und gesicherte Erkenntnisse" action={isEditing && <button className="btn btn-outline-secondary btn-sm" type="button" onClick={addTopic}><IconPlus size={15} /> Thema</button>} />
            </div>
            <div className="card-body protocol-section-body">
              {draft.topics.map((topic, index) => (
                <article className="protocol-topic-row" key={topic.id}>
                  <span className="protocol-section-number">{String(index + 1).padStart(2, '0')}</span>
                  <div className="protocol-topic-fields">
                    <InputField label="Tagesordnungspunkt" value={topic.title} disabled={disabled} required maxLength={180} placeholder="Thema" onChange={(value) => patchTopic(topic.id, { title: value })} />
                    <TextareaField label="Erkenntnisse / Verlauf" value={topic.findings} disabled={disabled} maxLength={1200} rows={2} onChange={(value) => patchTopic(topic.id, { findings: value })} />
                  </div>
                  {isEditing && <button className="btn btn-outline-secondary btn-sm protocol-remove-button" type="button" aria-label="Thema entfernen" onClick={() => updateDraft('topics', draft.topics.filter((item) => item.id !== topic.id))}><IconTrash size={15} /></button>}
                </article>
              ))}
              {draft.topics.length === 0 && <div className="protocol-inline-empty">Für diese Sitzung sind noch keine Themen erfasst.</div>}
            </div>
          </section>

          <section className="protocol-section card">
            <div className="card-header">
              <SectionHeading number="05" title="Entscheidungen" description="Beschlüsse mit Begründung, Zuständigkeit und optionalem Risikobezug" action={isEditing && <button className="btn btn-outline-secondary btn-sm" type="button" onClick={addDecision}><IconPlus size={15} /> Beschluss</button>} />
            </div>
            <div className="card-body protocol-section-body">
              {draft.decisions.map((decision, index) => (
                <article className="protocol-decision-row" key={decision.id}>
                  <div className="protocol-decision-marker"><IconCheck size={16} /><span>{String(index + 1).padStart(2, '0')}</span></div>
                  <div className="protocol-decision-fields">
                    <TextareaField label="Beschluss" value={decision.text} disabled={disabled} required maxLength={500} rows={2} placeholder="Was wurde verbindlich beschlossen?" onChange={(value) => patchDecision(decision.id, { text: value })} />
                    <div className="protocol-fields-grid protocol-fields-grid--compact">
                      <InputField label="Begründung" value={decision.rationale} disabled={disabled} maxLength={1200} placeholder="Sachliche Entscheidungsgrundlage" onChange={(value) => patchDecision(decision.id, { rationale: value })} />
                      <InputField label="Verantwortlich" value={decision.owner} disabled={disabled} required maxLength={120} onChange={(value) => patchDecision(decision.id, { owner: value })} />
                      <label className="form-label protocol-field">Bezug zu Risiko
                        <select className="form-select form-select-sm" value={decision.risk_id ?? ''} disabled={disabled} onChange={(event) => patchDecision(decision.id, { risk_id: event.target.value || null })}>
                          <option value="">Kein Risikobezug</option>
                          {draft.risks.map((risk) => <option key={risk.id} value={risk.id}>{risk.id} · {risk.title || 'Unbenanntes Risiko'}</option>)}
                        </select>
                      </label>
                    </div>
                  </div>
                  {isEditing && <button className="btn btn-outline-secondary btn-sm protocol-remove-button" type="button" aria-label="Beschluss entfernen" onClick={() => {
                    updateDraft('decisions', draft.decisions.filter((item) => item.id !== decision.id))
                    updateDraft('measures', draft.measures.map((measure) => measure.decision_id === decision.id ? { ...measure, decision_id: null } : measure))
                  }}><IconTrash size={15} /></button>}
                </article>
              ))}
              {draft.decisions.length === 0 && <div className="protocol-inline-empty">Noch keine Beschlüsse dokumentiert.</div>}
            </div>
          </section>

          <section className="protocol-section card">
            <div className="card-header">
              <SectionHeading number="06" title="Maßnahmen" description="Aufgaben, Fristen und Umsetzungsstatus; Beschlüsse werden zugeordnet" action={isEditing && <button className="btn btn-outline-secondary btn-sm" type="button" onClick={addMeasure}><IconPlus size={15} /> Maßnahme</button>} />
            </div>
            <div className="table-responsive protocol-table-wrap">
              <table className="table table-vcenter protocol-table">
                <thead><tr><th>Aufgabe</th><th>Zuständig</th><th>Frist</th><th>Status</th><th>Beschlussbezug</th>{isEditing && <th aria-label="Aktionen" />}</tr></thead>
                <tbody>
                  {draft.measures.map((measure) => (
                    <tr key={measure.id}>
                      <td><span className="protocol-item-id">{measure.id}</span><input className="form-control form-control-sm" value={measure.task} required disabled={disabled} maxLength={500} placeholder="Maßnahme beschreiben" onChange={(event) => patchMeasure(measure.id, { task: event.target.value })} /></td>
                      <td><input className="form-control form-control-sm" value={measure.owner} required disabled={disabled} maxLength={120} placeholder="Name / Funktion" onChange={(event) => patchMeasure(measure.id, { owner: event.target.value })} /></td>
                      <td><input className="form-control form-control-sm" type="date" value={measure.due_date ?? ''} disabled={disabled} onChange={(event) => patchMeasure(measure.id, { due_date: event.target.value || null })} /></td>
                      <td><select className="form-select form-select-sm" value={measure.status} disabled={disabled} onChange={(event) => patchMeasure(measure.id, { status: event.target.value as StaffProtocolMeasure['status'] })}><option value="open">Offen</option><option value="in_progress">In Arbeit</option><option value="completed">Erledigt</option></select></td>
                      <td><select className="form-select form-select-sm" value={measure.decision_id ?? ''} disabled={disabled} onChange={(event) => patchMeasure(measure.id, { decision_id: event.target.value || null })}><option value="">Kein Beschluss</option>{draft.decisions.map((decision) => <option key={decision.id} value={decision.id}>{decision.id} · {decision.text || 'Unbenannt'}</option>)}</select></td>
                      {isEditing && <td><button className="btn btn-outline-secondary btn-sm protocol-remove-button" type="button" aria-label={`${measure.id} entfernen`} onClick={() => updateDraft('measures', draft.measures.filter((item) => item.id !== measure.id))}><IconTrash size={15} /></button></td>}
                    </tr>
                  ))}
                  {draft.measures.length === 0 && <tr><td colSpan={isEditing ? 6 : 5} className="protocol-table-empty">Noch keine Maßnahmen festgelegt.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section className="protocol-section card">
            <div className="card-header">
              <SectionHeading number="07" title="Offene Punkte" description="Ungeklärte Fragen und vereinbarte Folgeschritte" action={isEditing && <button className="btn btn-outline-secondary btn-sm" type="button" onClick={addOpenPoint}><IconPlus size={15} /> Offener Punkt</button>} />
            </div>
            <div className="table-responsive protocol-table-wrap">
              <table className="table table-vcenter protocol-table">
                <thead><tr><th>Frage / Klärungsbedarf</th><th>Verantwortlich</th><th>Wiedervorlage</th>{isEditing && <th aria-label="Aktionen" />}</tr></thead>
                <tbody>
                  {draft.open_points.map((point) => (
                    <tr key={point.id}>
                      <td><span className="protocol-item-id">{point.id}</span><input className="form-control form-control-sm" value={point.question} required disabled={disabled} maxLength={500} placeholder="Was ist noch ungeklärt?" onChange={(event) => patchOpenPoint(point.id, { question: event.target.value })} /></td>
                      <td><input className="form-control form-control-sm" value={point.owner} disabled={disabled} maxLength={120} placeholder="Name / Funktion" onChange={(event) => patchOpenPoint(point.id, { owner: event.target.value })} /></td>
                      <td><input className="form-control form-control-sm" type="date" value={point.follow_up_date ?? ''} disabled={disabled} onChange={(event) => patchOpenPoint(point.id, { follow_up_date: event.target.value || null })} /></td>
                      {isEditing && <td><button className="btn btn-outline-secondary btn-sm protocol-remove-button" type="button" aria-label={`${point.id} entfernen`} onClick={() => updateDraft('open_points', draft.open_points.filter((item) => item.id !== point.id))}><IconTrash size={15} /></button></td>}
                    </tr>
                  ))}
                  {draft.open_points.length === 0 && <tr><td colSpan={isEditing ? 4 : 3} className="protocol-table-empty">Keine offenen Punkte für diese Sitzung erfasst.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <div className="protocol-document-footer">
            <span><IconShieldCheck size={15} /> Änderungen werden als neue Revision gespeichert. Vorherige Fassungen bleiben erhalten.</span>
            {isEditing && <button type="submit" className="btn btn-primary" disabled={isSaving}><IconDeviceFloppy size={16} /> {isSaving ? 'Speichert …' : 'Protokoll speichern'}</button>}
          </div>
        </form>
      </div>
    </section>
  )
}
