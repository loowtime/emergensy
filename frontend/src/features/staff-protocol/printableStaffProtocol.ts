import type { StaffProtocolDocument, StaffProtocolRecord } from '../../types'
import {
  getGrossRiskLevel,
  getRiskLevel,
  RISK_CATEGORY_LABELS,
  RISK_STATUS_LABELS,
  RISK_TREATMENT_LABELS,
} from './riskScoring'
import { formatSituationTimestamp } from '../situation-log/presentation'

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPE_MAP[character] ?? character)
}

function text(value: string | null | undefined): string {
  return value?.trim() ? escapeHtml(value) : '—'
}

function formatDate(value: string): string {
  const date = new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime()) ? escapeHtml(value) : date.toLocaleDateString('de-DE', { dateStyle: 'long' })
}

function section(title: string, body: string): string {
  return `<section><h2>${title}</h2>${body || '<p class="empty">Keine Einträge dokumentiert.</p>'}</section>`
}

function list<T>(items: T[], render: (item: T, index: number) => string): string {
  return items.length ? items.map(render).join('') : ''
}

function getPrintableSections(protocol: StaffProtocolDocument): string {
  const risks = list(protocol.risks, (risk) => {
    const gross = getGrossRiskLevel(risk)
    const residual = getRiskLevel(risk)
    return `<article class="risk-entry">
      <div class="risk-entry-heading">
        <div><strong>${escapeHtml(risk.id)} · ${text(risk.title)}</strong><br><span>${RISK_CATEGORY_LABELS[risk.category]} · ${RISK_STATUS_LABELS[risk.status]}</span></div>
        <span>Owner: ${text(risk.owner)}</span>
      </div>
      <p><strong>Brutto:</strong> E ${risk.probability}/5 × A ${risk.impact}/5 · <span class="risk ${gross.className}">${gross.label} ${gross.score}/25</span>
      &nbsp; <strong>Rest:</strong> E ${risk.residual_probability}/5 × A ${risk.residual_impact}/5 · <span class="risk ${residual.className}">${residual.label} ${residual.score}/25</span></p>
      <p><strong>Strategie:</strong> ${RISK_TREATMENT_LABELS[risk.treatment]} · <strong>Nächster Review:</strong> ${risk.review_date ? formatDate(risk.review_date) : '—'}</p>
      <p><strong>Frühindikator:</strong> ${text(risk.trigger)}<br><strong>Bestehende Kontrollen:</strong> ${text(risk.existing_controls)}</p>
      <p><strong>Gegenmaßnahme:</strong> ${text(risk.response_plan)}<br><strong>Evidenz / Annahmen:</strong> ${text(risk.evidence)}</p>
      ${risk.status === 'accepted' ? `<p><strong>Akzeptiert durch:</strong> ${text(risk.accepted_by)} · <strong>Begründung:</strong> ${text(risk.acceptance_rationale)}</p>` : ''}
    </article>`
  })
  const topics = list(protocol.topics, (topic, index) => `
    <article class="entry"><h3>${String(index + 1).padStart(2, '0')} · ${text(topic.title)}</h3>
    <p>${text(topic.findings)}</p></article>`)
  const decisions = list(protocol.decisions, (decision) => `
    <article class="entry"><div class="entry-head"><h3>${escapeHtml(decision.id)} · ${text(decision.text)}</h3><span>${text(decision.owner)}</span></div>
    <p><strong>Begründung:</strong> ${text(decision.rationale)}</p>
    <p><strong>Risikobezug:</strong> ${text(decision.risk_id)}</p></article>`)
  const measures = list(protocol.measures, (measure) => `
    <tr><td><strong>${escapeHtml(measure.id)}</strong><br>${text(measure.task)}</td>
    <td>${text(measure.owner)}</td><td>${measure.due_date ? formatDate(measure.due_date) : '—'}</td>
    <td>${measure.status === 'completed' ? 'Erledigt' : measure.status === 'in_progress' ? 'In Arbeit' : 'Offen'}</td>
    <td>${text(measure.decision_id)}</td></tr>`)
  const openPoints = list(protocol.open_points, (point) => `
    <tr><td><strong>${escapeHtml(point.id)}</strong><br>${text(point.question)}</td>
    <td>${text(point.owner)}</td><td>${point.follow_up_date ? formatDate(point.follow_up_date) : '—'}</td></tr>`)
  return [
    section('Aktuelle Lage', `<p class="narrative">${text(protocol.situation_summary)}</p>`),
    section('Forschungsrisikoregister', risks),
    section('Besprochene Themen', topics),
    section('Entscheidungen', decisions),
    section('Maßnahmen', `<table><thead><tr><th>Aufgabe</th><th>Zuständig</th><th>Frist</th><th>Status</th><th>Beschluss</th></tr></thead><tbody>${measures}</tbody></table>`),
    section('Offene Punkte', `<table><thead><tr><th>Klärungsbedarf</th><th>Verantwortlich</th><th>Wiedervorlage</th></tr></thead><tbody>${openPoints}</tbody></table>`),
  ].join('')
}

export function createPrintableStaffProtocol(record: StaffProtocolRecord): string {
  const { protocol } = record
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(protocol.title)} · RiskPilot</title>
  <style>
    :root { color: #263746; background: #edf1f4; font-family: Inter, "Segoe UI", Arial, sans-serif; font-size: 13px; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    .toolbar { position: sticky; top: 0; display: flex; justify-content: space-between; align-items: center; padding: 12px 5vw; background: #244e6a; color: white; }
    button { padding: 9px 14px; border: 0; border-radius: 4px; background: white; color: #244e6a; font: inherit; font-weight: 650; cursor: pointer; }
    main { max-width: 1080px; margin: 24px auto; padding: 42px 48px; background: white; border: 1px solid #d9e0e6; }
    .eyebrow { color: #647584; font-size: 10px; font-weight: 700; letter-spacing: .12em; }
    h1 { margin: 10px 0 6px; font-size: 27px; letter-spacing: -.03em; }
    .meta { color: #61717e; line-height: 1.8; }
    .session-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 24px 0; padding: 16px; border: 1px solid #d9e0e6; background: #f7f9fa; }
    .session-grid span { display: block; margin-bottom: 4px; color: #6d7b87; font-size: 10px; text-transform: uppercase; }
    section { margin-top: 26px; break-inside: avoid; }
    h2 { margin: 0 0 10px; padding-bottom: 8px; border-bottom: 1px solid #d9e0e6; font-size: 16px; }
    h3 { margin: 0; font-size: 13px; }
    p { line-height: 1.6; }
    .narrative { white-space: pre-wrap; }
    .entry { padding: 12px 0; border-bottom: 1px solid #e5e9ec; }
    .entry:last-child { border-bottom: 0; }
    .risk-entry { padding: 12px 0; border-bottom: 1px solid #dfe5e9; break-inside: avoid; }
    .risk-entry:last-child { border-bottom: 0; }
    .risk-entry-heading { display: flex; justify-content: space-between; gap: 12px; }
    .risk-entry-heading > div > span { display: inline-block; margin-top: 4px; color: #647584; font-size: 10px; }
    .risk-entry p { margin: 7px 0 0; }
    .entry-head { display: flex; justify-content: space-between; gap: 12px; }
    .entry-head span { color: #637382; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px; border-bottom: 1px solid #e3e8ec; text-align: left; vertical-align: top; }
    th { background: #f3f6f8; color: #586a79; font-size: 10px; text-transform: uppercase; }
    .risk { display: inline-block; padding: 3px 6px; border-radius: 3px; white-space: nowrap; }
    .low { background: #e8f2ed; color: #35654f; }
    .guarded { background: #f5f0e2; color: #775c22; }
    .high { background: #f8eadd; color: #8d521e; }
    .critical { background: #f6e5e4; color: #963f3c; }
    .empty { color: #778693; }
    .notice { margin-top: 28px; color: #6c7a86; font-size: 10px; }
    @media print {
      :root { background: white; }
      .toolbar { display: none; }
      main { max-width: none; margin: 0; padding: 0; border: 0; }
      @page { margin: 16mm; }
    }
    @media (max-width: 700px) {
      main { margin: 0; padding: 22px; }
      .session-grid { grid-template-columns: 1fr 1fr; }
    }
  </style>
</head>
<body>
  <div class="toolbar"><span>RISKPILOT · LAGEZENTRUM HAMBURG · REVISION ${record.revision}</span><button onclick="window.print()">Drucken / als PDF speichern</button></div>
  <main>
    <div class="eyebrow">STABSARBEIT · SITZUNGSPROTOKOLL · REVISION ${record.revision}</div>
    <h1>${escapeHtml(protocol.title)}</h1>
    <div class="meta">${formatDate(protocol.meeting_date)} · ${escapeHtml(protocol.meeting_time)} Uhr · Anlass: ${text(protocol.occasion)}</div>
    <div class="session-grid">
      <div><span>Sitzungsleitung</span><strong>${text(protocol.session_lead)}</strong></div>
      <div><span>Protokollführung</span><strong>${text(protocol.recorder)}</strong></div>
      <div><span>Teilnehmende / Funktionen</span><strong>${text(protocol.participants)}</strong></div>
    </div>
    ${getPrintableSections(protocol)}
    <p class="notice">Interne Arbeitsunterlage. Revision ${record.revision}, zuletzt gespeichert ${escapeHtml(formatSituationTimestamp(record.updated_at))}. Die Anwendung stellt keine revisionssichere oder signierte Archivierung bereit.</p>
  </main>
</body>
</html>`
}
