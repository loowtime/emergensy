import { useCallback, useEffect, useState } from 'react'
import { Crosshair, Focus, LocateFixed } from 'lucide-react'
import L from 'leaflet'
import { MapContainer, Marker, Popup, TileLayer, useMap, ZoomControl } from 'react-leaflet'
import type { RiskEvent, Severity } from '../../types'
import { HAMBURG_CENTER } from './locations'
import 'leaflet/dist/leaflet.css'
import './IncidentMap.css'

const markerIcons = Object.fromEntries(
  (['critical', 'warning', 'info'] as const).map((severity) => [severity, L.divIcon({
    className: 'incident-marker-shell',
    html: `<span class="incident-marker incident-marker--${severity}"><span></span></span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })]),
) as Record<Severity, L.DivIcon>

function MapInstanceBridge({ onReady }: { onReady: (map: L.Map) => void }) {
  const map = useMap()

  useEffect(() => onReady(map), [map, onReady])
  return null
}

export function IncidentMap({ events }: { events: RiskEvent[] }) {
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null)
  const handleMapReady = useCallback((map: L.Map) => setMapInstance(map), [])
  const mappedEvents = events.filter(
    (event): event is RiskEvent & { latitude: number; longitude: number } =>
      typeof event.latitude === 'number' && typeof event.longitude === 'number',
  )
  const mappedOpenEvents = mappedEvents.filter((event) => event.status !== 'resolved')
  const unmappedEventCount = events.length - mappedEvents.length

  function focusOpenEvents() {
    if (!mapInstance) return
    if (mappedOpenEvents.length === 0) {
      mapInstance.setView(HAMBURG_CENTER, 12)
      return
    }
    const bounds = L.latLngBounds(mappedOpenEvents.map((event) => [event.latitude, event.longitude]))
    mapInstance.fitBounds(bounds.pad(0.18), { maxZoom: 14 })
  }

  return (
    <article className="map-panel card" id="map">
      <div className="panel-heading map-heading card-header">
        <div><h2>Lagekarte Hamburg</h2><p><span className="map-live-dot" /> {mappedEvents.length} Ereignisse auf Karte <span className="panel-separator">·</span> Einsatzgebiet Hamburg</p></div>
        <div className="map-tools">
          <button className="map-tool btn btn-outline-secondary btn-sm" title="Offene Ereignisse einblenden" aria-label="Offene Ereignisse einblenden" disabled={!mapInstance} onClick={focusOpenEvents}><Focus size={16} /></button>
          <button className="map-tool btn btn-outline-secondary btn-sm" title="Karte auf Hamburg zentrieren" aria-label="Karte auf Hamburg zentrieren" disabled={!mapInstance} onClick={() => mapInstance?.setView(HAMBURG_CENTER, 12)}><LocateFixed size={16} /></button>
        </div>
      </div>
      <div className="map-wrap">
        <MapContainer center={HAMBURG_CENTER} zoom={12} zoomControl={false} scrollWheelZoom className="incident-map">
          <MapInstanceBridge onReady={handleMapReady} />
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <ZoomControl position="bottomright" />
          {mappedEvents.map((event) => <Marker key={event.id} position={[event.latitude, event.longitude]} icon={markerIcons[event.severity]}>
            <Popup><strong>{event.title}</strong><br />{event.location}<br /><small>#{event.id} · {event.owner}</small></Popup>
          </Marker>)}
        </MapContainer>
        <div className="map-legend">
          <span><i className="legend-dot legend-dot--critical" /> Kritisch <b>{events.filter((event) => event.severity === 'critical').length}</b></span>
          <span><i className="legend-dot legend-dot--warning" /> Warnung <b>{events.filter((event) => event.severity === 'warning').length}</b></span>
          <span><i className="legend-dot legend-dot--info" /> Information <b>{events.filter((event) => event.severity === 'info').length}</b></span>
        </div>
        <div className="map-scale">© OpenStreetMap-Mitwirkende</div>
      </div>
      <div className="map-footer">
        <span><Crosshair size={14} /> Einsatzgebiet Hamburg · freie Adresssuche</span>
        <span>{unmappedEventCount ? `${unmappedEventCount} ältere Ereignisse ohne Kartenkoordinaten` : <><a href="https://photon.komoot.io/" target="_blank" rel="noreferrer">Photon</a> · OpenStreetMap</>}</span>
      </div>
    </article>
  )
}
