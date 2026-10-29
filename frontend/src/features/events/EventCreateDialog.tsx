import { useEffect, useState, type FormEvent } from 'react'
import { MapPin, Plus, X } from 'lucide-react'
import { ApiError, saveEvent, searchAddresses } from '../../api'
import type { AddressSuggestion, EventDraft, RiskEvent } from '../../types'
import { DEFAULT_LOCATION } from './locations'
import './EventCreateDialog.css'

type Props = {
  token: string
  onClose: () => void
  onCreated: (event: RiskEvent) => void
  onSessionExpired: () => void
}

function containsHouseNumber(query: string): boolean {
  const withoutPostcode = query.replace(/\b\d{5}\b/g, '')
  const withoutCity = withoutPostcode.replace(/\b(?:hamburg|deutschland|germany)\b/gi, '')
  return /(?:^|\s)\d+[a-z]?(?:[-/]\d+[a-z]?)?\s*[,.]*$/i.test(withoutCity.trim())
}

export function EventCreateDialog({ token, onClose, onCreated, onSessionExpired }: Props) {
  const [draft, setDraft] = useState<EventDraft>({
    title: '',
    category: 'Infrastruktur',
    severity: 'warning',
    location: DEFAULT_LOCATION.address,
    latitude: DEFAULT_LOCATION.coordinates[0],
    longitude: DEFAULT_LOCATION.coordinates[1],
    description: '',
    owner: 'M. Keller',
  })
  const [addressQuery, setAddressQuery] = useState(DEFAULT_LOCATION.address)
  const [selectedAddress, setSelectedAddress] = useState(DEFAULT_LOCATION.address)
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    const query = addressQuery.trim()
    if (query.length < 4 || query === selectedAddress) return

    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      setIsSearching(true)
      setSearchError('')
      void searchAddresses(token, query, controller.signal).then((results) => {
        setSuggestions(results)
        if (results.length === 0) {
          setSearchError(containsHouseNumber(query)
            ? 'Diese Hausnummer ist in den Hamburger Kartendaten nicht eindeutig verzeichnet. Bitte Schreibweise prüfen.'
            : 'Keine passenden Adressen in Hamburg gefunden.')
        }
      }).catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (error instanceof ApiError && error.status === 401) {
          onSessionExpired()
        } else {
          setSearchError(error instanceof Error ? error.message : 'Adresssuche fehlgeschlagen.')
        }
      }).finally(() => {
        if (!controller.signal.aborted) setIsSearching(false)
      })
    }, 700)

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [addressQuery, onSessionExpired, selectedAddress, token])

  async function handleSubmit(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault()
    setIsSaving(true)
    setFormError('')
    try {
      const created = await saveEvent(token, draft)
      onCreated(created)
      onClose()
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSessionExpired()
      } else {
        setFormError(error instanceof Error ? error.message : 'Unbekannter Fehler beim Speichern.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="event-modal" role="dialog" aria-modal="true" aria-labelledby="event-modal-title">
        <div className="modal-heading">
          <div><span className="modal-kicker">NEUER VORGANG</span><h2 id="event-modal-title">Ereignis erstellen</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Dialog schließen"><X size={18} /></button>
        </div>
        <form className="event-form" onSubmit={(submitEvent) => void handleSubmit(submitEvent)}>
          <label>Titel<input autoFocus required minLength={3} maxLength={120} value={draft.title} onChange={(change) => setDraft({ ...draft, title: change.target.value })} placeholder="Kurz und eindeutig" /></label>
          <div className="form-row">
            <label>Kategorie<select value={draft.category} onChange={(change) => setDraft({ ...draft, category: change.target.value as EventDraft['category'] })}><option>Brand</option><option>Verkehr</option><option>Infrastruktur</option><option>Wetter</option><option>Sonstiges</option></select></label>
            <label>Priorität<select value={draft.severity} onChange={(change) => setDraft({ ...draft, severity: change.target.value as EventDraft['severity'] })}><option value="critical">Kritisch</option><option value="warning">Erhöht</option><option value="info">Niedrig</option></select></label>
          </div>
          <label>Einsatzadresse
            <div className="address-autocomplete">
              <input
                autoComplete="street-address"
                role="combobox"
                aria-label="Straße und Hausnummer in Hamburg"
                aria-autocomplete="list"
                aria-expanded={suggestions.length > 0}
                aria-controls="address-suggestions"
                required
                minLength={5}
                maxLength={240}
                value={addressQuery}
                onChange={(change) => {
                  const value = change.target.value
                  setAddressQuery(value)
                  setSelectedAddress('')
                  setSuggestions([])
                  setIsSearching(false)
                  setSearchError('')
                  setDraft({ ...draft, location: value, latitude: null, longitude: null })
                }}
                placeholder="z. B. Mönckebergstraße 10, Hamburg"
              />
              {isSearching && <span className="address-search-spinner" aria-label="Adresssuche läuft" />}
              {suggestions.length > 0 && <div className="address-suggestions" id="address-suggestions" role="listbox" aria-label="Hamburger Adressvorschläge">
                {suggestions.map((suggestion) => <button key={`${suggestion.latitude}-${suggestion.longitude}-${suggestion.label}`} className="address-suggestion" type="button" role="option" aria-selected={selectedAddress === suggestion.label} onClick={() => {
                  setAddressQuery(suggestion.label)
                  setSelectedAddress(suggestion.label)
                  setSuggestions([])
                  setSearchError('')
                  setDraft({ ...draft, location: suggestion.label, latitude: suggestion.latitude, longitude: suggestion.longitude })
                }}>
                  <MapPin size={15} /><span>{suggestion.label}</span>
                </button>)}
              </div>}
            </div>
            <span className="address-attribution">{searchError || (draft.latitude !== null && draft.longitude !== null ? 'Kartenstandort ausgewählt' : 'Straße und Hausnummer können gemeinsam eingegeben werden; passenden Treffer auswählen')} · Suchtext wird an Photon übermittelt</span>
          </label>
          <label>Beschreibung<textarea required minLength={5} maxLength={1200} rows={4} value={draft.description} onChange={(change) => setDraft({ ...draft, description: change.target.value })} placeholder="Was ist passiert? Welche Auswirkungen sind bekannt?" /></label>
          <label>Verantwortlich<input required minLength={2} maxLength={80} value={draft.owner} onChange={(change) => setDraft({ ...draft, owner: change.target.value })} /></label>
          {formError && <p className="form-error" role="alert">{formError}</p>}
          <div className="modal-actions">
            <button type="button" className="refresh-button" onClick={onClose}>Abbrechen</button>
            <button type="submit" className="create-event-button" disabled={isSaving || draft.latitude === null || draft.longitude === null}>
              <Plus size={15} />{isSaving ? 'Wird gespeichert…' : 'Ereignis speichern'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
