export type Severity = 'critical' | 'warning' | 'info'
export type EventStatus = 'open' | 'monitoring' | 'resolved'
export type RiskEvent = {
  id: number
  title: string
  category: string
  severity: Severity
  location: string
  latitude: number | null
  longitude: number | null
  description: string
  owner: string
  status: EventStatus
  created_at: string
}
export type EventDraft = Omit<RiskEvent, 'id' | 'status' | 'created_at'>
export type SituationLogType = 'observation' | 'decision' | 'measure' | 'resource' | 'handover'
export type SituationLogEntry = {
  id: number
  entry_type: SituationLogType
  content: string
  author: string
  event_id: number | null
  event_title: string | null
  created_at: string
}
export type SituationLogFilters = {
  entryType: SituationLogType | ''
  eventId: string
  fromDate: string
  toDate: string
  query: string
}
export type SituationLogPage = {
  entries: SituationLogEntry[]
  total: number
  offset: number
  limit: number
}
export type SituationReport = {
  generated_at: string
  total: number
  entries: SituationLogEntry[]
}
export type OperationLocation = {
  address: string
  label: string
  coordinates: [number, number]
}
export type AddressSuggestion = {
  label: string
  latitude: number
  longitude: number
}
