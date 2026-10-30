import type { SituationLogType } from '../../types'

export const SITUATION_LOG_TYPE_LABELS: Record<SituationLogType, string> = {
  observation: 'Beobachtung',
  decision: 'Entscheidung',
  measure: 'Maßnahme',
  resource: 'Ressource',
  handover: 'Übergabe',
}

const timezoneSuffix = /(?:Z|[+-]\d{2}:?\d{2})$/i
const timestampFormatter = new Intl.DateTimeFormat('de-DE', {
  dateStyle: 'short',
  timeStyle: 'short',
})

function parseSituationTimestamp(value: string): Date {
  const normalized = value.trim().replace(' ', 'T')
  const timestamp = timezoneSuffix.test(normalized) ? normalized : `${normalized}Z`
  return new Date(timestamp)
}

export function formatSituationTimestamp(value: string): string {
  const timestamp = parseSituationTimestamp(value)
  return Number.isNaN(timestamp.getTime()) ? value : timestampFormatter.format(timestamp)
}
