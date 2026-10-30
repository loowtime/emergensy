import type {
  AddressSuggestion,
  EventDraft,
  EventStatus,
  OperationCommandDocument,
  OperationCommandRecord,
  RiskEvent,
  SituationLogEntry,
  SituationLogFilters,
  SituationLogPage,
  SituationReport,
  StaffProtocolDocument,
  StaffProtocolPage,
  StaffProtocolRecord,
  StaffProtocolRevision,
} from './types'

function resolveApiUrl(configuredUrl: string | undefined): string {
  const apiUrl = new URL(configuredUrl ?? 'http://127.0.0.1:8000')
  const isLoopback =
    apiUrl.hostname === 'localhost'
    || apiUrl.hostname === '127.0.0.1'
    || apiUrl.hostname === '[::1]'
  const isAllowedProtocol = apiUrl.protocol === 'https:' || (apiUrl.protocol === 'http:' && isLoopback)

  if (
    apiUrl.username
    || apiUrl.password
    || apiUrl.pathname !== '/'
    || apiUrl.search
    || apiUrl.hash
    || !isAllowedProtocol
  ) {
    throw new Error(
      'VITE_API_URL muss ein sicherer API-Origin ohne Pfad oder Zugangsdaten sein; HTTP ist nur auf localhost erlaubt.',
    )
  }

  return apiUrl.toString().replace(/\/+$/, '')
}

const API_URL = resolveApiUrl(import.meta.env.VITE_API_URL)

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function loadEvents(token: string): Promise<RiskEvent[]> {
  const response = await fetch(`${API_URL}/api/events`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new ApiError('Ereignisse konnten nicht geladen werden', response.status)
  return response.json()
}

export async function saveEvent(token: string, event: EventDraft): Promise<RiskEvent> {
  const response = await fetch(`${API_URL}/api/events`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  })
  if (!response.ok) throw new ApiError('Ereignis konnte nicht angelegt werden', response.status)
  return response.json()
}

export async function setEventStatus(token: string, id: number, status: EventStatus): Promise<RiskEvent> {
  const response = await fetch(`${API_URL}/api/events/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  if (!response.ok) throw new ApiError('Status konnte nicht aktualisiert werden', response.status)
  return response.json()
}

export async function removeEvent(token: string, id: number): Promise<void> {
  const response = await fetch(`${API_URL}/api/events/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new ApiError('Ereignis konnte nicht gelöscht werden', response.status)
}

function situationLogParameters(filters: SituationLogFilters): URLSearchParams {
  const parameters = new URLSearchParams()
  if (filters.entryType) parameters.set('entry_type', filters.entryType)
  if (filters.eventId) parameters.set('event_id', filters.eventId)
  if (filters.fromDate) parameters.set('from_date', filters.fromDate)
  if (filters.toDate) parameters.set('to_date', filters.toDate)
  if (filters.query.trim()) parameters.set('q', filters.query.trim())
  return parameters
}

export async function loadSituationLog(
  token: string,
  filters: SituationLogFilters,
  offset: number,
): Promise<SituationLogPage> {
  const parameters = situationLogParameters(filters)
  parameters.set('offset', String(offset))
  parameters.set('limit', '50')
  const response = await fetch(`${API_URL}/api/situation-log?${parameters}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new ApiError('Stabsprotokoll konnte nicht geladen werden', response.status)
  return response.json()
}

export async function loadSituationReport(
  token: string,
  filters: SituationLogFilters,
): Promise<SituationReport> {
  const parameters = situationLogParameters(filters)
  const response = await fetch(`${API_URL}/api/situation-log/report?${parameters}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new ApiError('Bericht konnte nicht erstellt werden', response.status)
  return response.json()
}

export async function saveSituationLogEntry(
  token: string,
  entry: Omit<SituationLogEntry, 'id' | 'created_at' | 'event_title'>,
): Promise<SituationLogEntry> {
  const response = await fetch(`${API_URL}/api/situation-log`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  })
  if (!response.ok) throw new ApiError('Stabseintrag konnte nicht gespeichert werden', response.status)
  return response.json()
}

export async function loadStaffProtocols(
  token: string,
  offset: number,
): Promise<StaffProtocolPage> {
  const parameters = new URLSearchParams({ offset: String(offset), limit: '50' })
  const response = await fetch(`${API_URL}/api/staff-protocols?${parameters}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new ApiError('Stabsprotokolle konnten nicht geladen werden', response.status)
  return response.json()
}

export async function loadStaffProtocolRevisions(
  token: string,
  protocolId: number,
): Promise<StaffProtocolRevision[]> {
  const response = await fetch(`${API_URL}/api/staff-protocols/${protocolId}/revisions`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new ApiError('Protokollhistorie konnte nicht geladen werden', response.status)
  return response.json()
}

export async function loadStaffProtocol(
  token: string,
  protocolId: number,
): Promise<StaffProtocolRecord> {
  const response = await fetch(`${API_URL}/api/staff-protocols/${protocolId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new ApiError('Aktuelles Stabsprotokoll konnte nicht geladen werden', response.status)
  return response.json()
}

export async function createStaffProtocol(
  token: string,
  protocol: StaffProtocolDocument,
): Promise<StaffProtocolRecord> {
  const response = await fetch(`${API_URL}/api/staff-protocols`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(protocol),
  })
  if (!response.ok) throw new ApiError('Stabsprotokoll konnte nicht gespeichert werden', response.status)
  return response.json()
}

export async function updateStaffProtocol(
  token: string,
  protocolId: number,
  expectedRevision: number,
  protocol: StaffProtocolDocument,
): Promise<StaffProtocolRecord> {
  const response = await fetch(`${API_URL}/api/staff-protocols/${protocolId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expected_revision: expectedRevision, protocol }),
  })
  if (response.status === 409) {
    throw new ApiError('Dieses Protokoll wurde zwischenzeitlich geändert. Lade die aktuelle Fassung und wiederhole deine Änderungen.', 409)
  }
  if (!response.ok) throw new ApiError('Änderungen am Stabsprotokoll konnten nicht gespeichert werden', response.status)
  return response.json()
}

export async function loadOperationCommand(
  token: string,
  eventId: number,
): Promise<OperationCommandRecord> {
  const response = await fetch(`${API_URL}/api/operations/${eventId}/command`, {
    headers: { Authorization: 'Bearer ' + token },
  })
  if (!response.ok) throw new ApiError('Einsatzführung konnte nicht geladen werden', response.status)
  return response.json()
}

export async function saveOperationCommand(
  token: string,
  eventId: number,
  expectedRevision: number,
  document: OperationCommandDocument,
): Promise<OperationCommandRecord> {
  const response = await fetch(`${API_URL}/api/operations/${eventId}/command`, {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expected_revision: expectedRevision, document }),
  })
  if (response.status === 409) {
    throw new ApiError('Die Einsatzführung wurde zwischenzeitlich geändert. Bitte neu laden.', 409)
  }
  if (!response.ok) throw new ApiError('Einsatzführung konnte nicht gespeichert werden', response.status)
  return response.json()
}

export async function searchAddresses(
  token: string,
  query: string,
  signal: AbortSignal,
): Promise<AddressSuggestion[]> {
  const parameters = new URLSearchParams({ q: query })
  const response = await fetch(`${API_URL}/api/locations/search?${parameters}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  })
  if (!response.ok) throw new ApiError('Adressvorschläge konnten nicht geladen werden', response.status)
  const payload: { suggestions: AddressSuggestion[] } = await response.json()
  return payload.suggestions
}

export async function loginAdmin(username: string, password: string): Promise<string> {
  let response: Response
  try {
    response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
  } catch {
    throw new Error('Backend nicht erreichbar. Bitte starte zuerst das Backend.')
  }
  if (response.status === 401) throw new Error('Benutzername oder Passwort falsch.')
  if (response.status === 429) throw new Error('Zu viele Fehlversuche. Die Anmeldung ist vorübergehend gesperrt; bitte später erneut versuchen.')
  if (response.status === 403) throw new Error('Der Demo-Login ist nur auf diesem Computer verfügbar.')
  if (!response.ok) throw new Error('Anmeldung fehlgeschlagen. Bitte Backend-Verbindung prüfen.')
  const payload: { access_token: string } = await response.json()
  return payload.access_token
}

export async function requestBackend(): Promise<string> {
  const response = await fetch(`${API_URL}/`)
  if (!response.ok) throw new Error(`Backend antwortet mit ${response.status}`)
  const payload: { message?: string } = await response.json()
  return payload.message ?? 'Backend erreichbar'
}

export async function logoutAdmin(token: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new ApiError('Abmeldung konnte nicht bestätigt werden', response.status)
}
