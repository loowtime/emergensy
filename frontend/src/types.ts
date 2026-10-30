export type Severity = 'critical' | 'warning' | 'info'
export type EventStatus = 'open' | 'monitoring' | 'resolved'
export type ApiConnectionState = 'checking' | 'online' | 'offline'
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
export type StaffProtocolRiskCategory =
  | 'methodology'
  | 'data_quality'
  | 'ethics'
  | 'privacy'
  | 'security'
  | 'resources'
  | 'timeline'
  | 'dependencies'
  | 'transfer'
  | 'other'
export type StaffProtocolRiskStatus = 'identified' | 'treating' | 'accepted' | 'closed'
export type StaffProtocolRiskTreatment = 'reduce' | 'avoid' | 'share' | 'accept'
export type StaffProtocolRisk = {
  id: string
  title: string
  category: StaffProtocolRiskCategory
  probability: number
  impact: number
  residual_probability: number
  residual_impact: number
  owner: string
  status: StaffProtocolRiskStatus
  treatment: StaffProtocolRiskTreatment
  existing_controls: string
  response_plan: string
  trigger: string
  review_date: string | null
  evidence: string
  acceptance_rationale: string
  accepted_by: string
}
export type StaffProtocolTopic = {
  id: string
  title: string
  findings: string
}
export type StaffProtocolDecision = {
  id: string
  text: string
  rationale: string
  owner: string
  risk_id: string | null
}
export type StaffProtocolMeasure = {
  id: string
  task: string
  owner: string
  due_date: string | null
  status: 'open' | 'in_progress' | 'completed'
  decision_id: string | null
}
export type StaffProtocolOpenPoint = {
  id: string
  question: string
  owner: string
  follow_up_date: string | null
}
export type StaffProtocolDocument = {
  title: string
  meeting_date: string
  meeting_time: string
  session_lead: string
  participants: string
  recorder: string
  occasion: string
  situation_summary: string
  risks: StaffProtocolRisk[]
  topics: StaffProtocolTopic[]
  decisions: StaffProtocolDecision[]
  measures: StaffProtocolMeasure[]
  open_points: StaffProtocolOpenPoint[]
}
export type StaffProtocolRecord = {
  id: number
  revision: number
  protocol: StaffProtocolDocument
  created_at: string
  updated_at: string
}
export type StaffProtocolRevision = {
  revision: number
  changed_by: string
  protocol: StaffProtocolDocument
  created_at: string
}
export type StaffProtocolPage = {
  records: StaffProtocolRecord[]
  total: number
  offset: number
  limit: number
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
