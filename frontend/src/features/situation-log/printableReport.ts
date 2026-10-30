import type { SituationLogFilters, SituationLogType, SituationReport } from '../../types'
import { formatSituationTimestamp, SITUATION_LOG_TYPE_LABELS } from './presentation'

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

export function createPrintableSituationReport(
  report: SituationReport,
  title: string,
  participants: string,
  filters: SituationLogFilters,
): string {
  const reportEntries = report.entries.map((entry) => {
    const eventReference = entry.event_id === null
      ? ''
      : `<span>Ereignis #${escapeHtml(String(entry.event_id))}${entry.event_title ? ` · ${escapeHtml(entry.event_title)}` : ''}</span>`

    return `
      <article class="entry">
        <header>
          <span class="badge badge-${escapeHtml(entry.entry_type)}">${SITUATION_LOG_TYPE_LABELS[entry.entry_type]}</span>
          <time>${escapeHtml(formatSituationTimestamp(entry.created_at))}</time>
        </header>
        <p>${escapeHtml(entry.content.replace(/\r\n?/g, '\n')).replace(/\n/g, '<br>')}</p>
        <footer>
          <span>Erfasst von: ${escapeHtml(entry.author)}</span>
          ${eventReference}
        </footer>
      </article>`
  }).join('')
  const typeCounts = report.entries.reduce<Record<SituationLogType, number>>((counts, entry) => {
    counts[entry.entry_type] += 1
    return counts
  }, { observation: 0, decision: 0, measure: 0, resource: 0, handover: 0 })
  const period = filters.fromDate || filters.toDate
    ? `${filters.fromDate ? escapeHtml(filters.fromDate) : 'Beginn'} – ${filters.toDate ? escapeHtml(filters.toDate) : 'heute'}`
    : 'Gesamter verfügbarer Zeitraum'
  const generatedAt = new Date(report.generated_at).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
  const filterSummary = [
    filters.entryType ? SITUATION_LOG_TYPE_LABELS[filters.entryType] : '',
    filters.eventId ? `Ereignis #${filters.eventId}` : '',
    filters.query.trim() ? `Suche: ${filters.query.trim()}` : '',
  ].filter(Boolean).map(escapeHtml).join(' · ')
  const entryCount = escapeHtml(String(report.total))
  const titleText = escapeHtml(title)
  const participantsText = participants.trim()
    ? `<br>Teilnehmende / Funktionen: ${escapeHtml(participants.trim())}`
    : ''
  const filterText = filterSummary ? `Filter: ${filterSummary}<br>` : ''

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${titleText}</title>
<style>
  :root {
    color: #23342c;
    background: #eef1ed;
    font-family: Arial, Helvetica, sans-serif;
  }

  body { margin: 0; }

  .toolbar {
    position: sticky;
    top: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 5vw;
    background: #172722;
    color: #fff;
  }

  button {
    padding: 10px 16px;
    border: 0;
    border-radius: 6px;
    background: #e6a16d;
    color: #172722;
    cursor: pointer;
    font-weight: 700;
  }

  main {
    max-width: 900px;
    margin: 32px auto;
    padding: 52px 64px;
    background: #fff;
    box-shadow: 0 6px 30px #17272218;
  }

  .eyebrow {
    color: #527362;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .13em;
  }

  .meta {
    color: #66776d;
    font-size: 13px;
    line-height: 1.8;
  }

  h1 { margin: 12px 0 8px; font-size: 30px; }

  .summary {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin: 28px 0;
    padding: 14px 0;
    border-block: 1px solid #dfe6df;
    font-size: 13px;
  }

  .entry {
    padding: 18px 0;
    border-bottom: 1px solid #e6ebe6;
    break-inside: avoid;
  }

  .entry header,
  .entry footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .entry header { color: #77867d; font-size: 12px; }
  .entry p { line-height: 1.65; overflow-wrap: anywhere; }
  .entry footer { color: #718077; font-size: 11px; }

  .badge {
    padding: 4px 8px;
    border-radius: 4px;
    background: #edf3ee;
    color: #466a54;
    font-size: 11px;
    font-weight: 700;
  }

  .badge-decision { background: #f1eef8; color: #67558a; }
  .badge-measure { background: #fff3e5; color: #93621b; }
  .badge-resource { background: #eaf3f6; color: #3c7282; }
  .badge-handover { background: #eaf0f8; color: #416286; }
  .empty { padding: 30px 0; color: #77867d; }
  .notice { margin-top: 30px; color: #718077; font-size: 11px; }

  @media print {
    :root { background: #fff; }
    .toolbar { display: none; }
    main { max-width: none; margin: 0; padding: 0; box-shadow: none; }
    @page { margin: 18mm; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <span>RISKPILOT · Lagezentrum Hamburg</span>
    <button onclick="window.print()">Drucken / als PDF speichern</button>
  </div>
  <main>
    <div class="eyebrow">STABSARBEIT · LAGEPROTOKOLL</div>
    <h1>${titleText}</h1>
    <div class="meta">
      Berichtszeitraum: ${period}<br>
      ${filterText}
      Erstellt: ${escapeHtml(generatedAt)} · ${entryCount} Einträge
      ${participantsText}
    </div>
    <div class="summary">
      <strong>${entryCount}</strong><span>Einträge</span>
      <span>${SITUATION_LOG_TYPE_LABELS.observation}: ${typeCounts.observation}</span>
      <span>${SITUATION_LOG_TYPE_LABELS.decision}: ${typeCounts.decision}</span>
      <span>${SITUATION_LOG_TYPE_LABELS.measure}: ${typeCounts.measure}</span>
      <span>${SITUATION_LOG_TYPE_LABELS.resource}: ${typeCounts.resource}</span>
      <span>${SITUATION_LOG_TYPE_LABELS.handover}: ${typeCounts.handover}</span>
    </div>
    ${reportEntries || '<p class="empty">Für die gewählten Filter liegen keine Einträge vor.</p>'}
    <p class="notice">Interne Arbeitsunterlage. Zeitstempel werden vom Anwendungsserver erzeugt. Die Anwendung bietet keine revisionssichere oder signierte Archivierung.</p>
  </main>
</body>
</html>`
}
