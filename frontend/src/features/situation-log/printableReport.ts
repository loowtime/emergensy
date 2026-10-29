import type { SituationLogFilters, SituationLogType, SituationReport } from '../../types'

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character)
}

function formatTimestamp(value: string): string {
  const timestamp = value.includes('Z') || value.includes('+') ? value : `${value.replace(' ', 'T')}Z`
  return new Date(timestamp).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
}

export function createPrintableSituationReport(
  report: SituationReport,
  title: string,
  participants: string,
  filters: SituationLogFilters,
): string {
  const typeNames: Record<SituationLogType, string> = {
    observation: 'Beobachtung',
    decision: 'Entscheidung',
    measure: 'Maßnahme',
    resource: 'Ressource',
    handover: 'Übergabe',
  }
  const reportEntries = report.entries.map((entry) => `
    <article class="entry">
      <header><span class="badge badge-${entry.entry_type}">${typeNames[entry.entry_type]}</span><time>${escapeHtml(formatTimestamp(entry.created_at))}</time></header>
      <p>${escapeHtml(entry.content).replace(/\n/g, '<br>')}</p>
      <footer><span>Erfasst von: ${escapeHtml(entry.author)}</span>${entry.event_id === null ? '' : `<span>Ereignis #${entry.event_id}${entry.event_title ? ` · ${escapeHtml(entry.event_title)}` : ''}</span>`}</footer>
    </article>`).join('')
  const typeCounts = report.entries.reduce<Record<SituationLogType, number>>((counts, entry) => {
    counts[entry.entry_type] += 1
    return counts
  }, { observation: 0, decision: 0, measure: 0, resource: 0, handover: 0 })
  const period = filters.fromDate || filters.toDate
    ? `${filters.fromDate ? escapeHtml(filters.fromDate) : 'Beginn'} – ${filters.toDate ? escapeHtml(filters.toDate) : 'heute'}`
    : 'Gesamter verfügbarer Zeitraum'
  const generatedAt = new Date(report.generated_at).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
  const filterSummary = [
    filters.entryType ? typeNames[filters.entryType] : '',
    filters.eventId ? `Ereignis #${filters.eventId}` : '',
    filters.query.trim() ? `Suche: ${filters.query.trim()}` : '',
  ].filter(Boolean).map(escapeHtml).join(' · ')

  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title>
<style>
  :root{font-family:Arial,Helvetica,sans-serif;color:#23342c;background:#eef1ed}
  body{margin:0}.toolbar{position:sticky;top:0;padding:14px 5vw;background:#172722;color:#fff;display:flex;justify-content:space-between;align-items:center}
  button{border:0;border-radius:6px;padding:10px 16px;background:#e6a16d;color:#172722;font-weight:700;cursor:pointer}
  main{max-width:900px;margin:32px auto;padding:52px 64px;background:#fff;box-shadow:0 6px 30px #17272218}
  .eyebrow{font-size:11px;letter-spacing:.13em;color:#527362;font-weight:700}.meta{color:#66776d;font-size:13px;line-height:1.8}
  h1{margin:12px 0 8px;font-size:30px}.summary{display:flex;gap:12px;flex-wrap:wrap;margin:28px 0;padding:14px 0;border-block:1px solid #dfe6df;font-size:13px}
  .entry{padding:18px 0;border-bottom:1px solid #e6ebe6;break-inside:avoid}.entry header,.entry footer{display:flex;justify-content:space-between;gap:12px;align-items:center}
  .entry header{font-size:12px;color:#77867d}.entry p{line-height:1.65;white-space:normal;overflow-wrap:anywhere}.entry footer{font-size:11px;color:#718077}
  .badge{padding:4px 8px;border-radius:4px;background:#edf3ee;color:#466a54;font-size:11px;font-weight:700}
  .badge-decision{background:#f1eef8;color:#67558a}.badge-measure{background:#fff3e5;color:#93621b}.badge-resource{background:#eaf3f6;color:#3c7282}.badge-handover{background:#eaf0f8;color:#416286}
  .empty{padding:30px 0;color:#77867d}.notice{font-size:11px;color:#718077;margin-top:30px}
  @media print{ :root{background:#fff} .toolbar{display:none} main{max-width:none;margin:0;padding:0;box-shadow:none} @page{margin:18mm} }
</style></head><body>
<div class="toolbar"><span>RISKPILOT · Lagezentrum Hamburg</span><button onclick="window.print()">Drucken / als PDF speichern</button></div>
<main><div class="eyebrow">STABSARBEIT · LAGEPROTOKOLL</div><h1>${escapeHtml(title)}</h1>
<div class="meta">Berichtszeitraum: ${period}<br>${filterSummary ? `Filter: ${filterSummary}<br>` : ''}Erstellt: ${escapeHtml(generatedAt)} · ${report.total} Einträge${participants.trim() ? `<br>Teilnehmende / Funktionen: ${escapeHtml(participants.trim())}` : ''}</div>
<div class="summary"><strong>${report.total}</strong><span>Einträge</span><span>${typeNames.observation}: ${typeCounts.observation}</span><span>${typeNames.decision}: ${typeCounts.decision}</span><span>${typeNames.measure}: ${typeCounts.measure}</span><span>${typeNames.resource}: ${typeCounts.resource}</span><span>${typeNames.handover}: ${typeCounts.handover}</span></div>
${reportEntries || '<p class="empty">Für die gewählten Filter liegen keine Einträge vor.</p>'}
<p class="notice">Interne Arbeitsunterlage. Zeitstempel werden vom Anwendungsserver erzeugt. Die Anwendung bietet keine revisionssichere oder signierte Archivierung.</p>
</main></body></html>`
}
