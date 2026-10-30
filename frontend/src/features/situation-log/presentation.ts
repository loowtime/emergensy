import type { SituationLogType } from '../../types'

export const SITUATION_LOG_TYPE_LABELS: Record<SituationLogType, string> = {
  observation: 'Beobachtung',
  decision: 'Entscheidung',
  measure: 'Maßnahme',
  resource: 'Ressource',
  handover: 'Übergabe',
}

export function formatSituationTimestamp(value: string): string {
  const normalized = value.trim().replace(' ', 'T')
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized)
  const timestamp = new Date(hasTimezone ? normalized : `${normalized}Z`)

  if (Number.isNaN(timestamp.getTime())) return value

  return timestamp.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
}
