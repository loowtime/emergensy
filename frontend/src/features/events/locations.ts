import type { OperationLocation } from '../../types'

export const HAMBURG_CENTER: [number, number] = [53.5511, 9.9937]

export const OPERATION_LOCATIONS: OperationLocation[] = [
  { address: 'Rathausmarkt 1, 20095 Hamburg', label: 'Rathausmarkt · Altstadt', coordinates: [53.5503, 9.9926] },
  { address: 'Glockengießerwall 5-7, 20095 Hamburg', label: 'Hauptbahnhof · St. Georg', coordinates: [53.5529, 10.0067] },
  { address: 'Platz der Deutschen Einheit 1, 20457 Hamburg', label: 'Elbphilharmonie · HafenCity', coordinates: [53.5413, 9.9843] },
  { address: 'Bei den St. Pauli-Landungsbrücken 5, 20359 Hamburg', label: 'Landungsbrücken · St. Pauli', coordinates: [53.5451, 9.9661] },
  { address: 'Paul-Nevermann-Platz 15, 22765 Hamburg', label: 'Bahnhof Altona · Altona', coordinates: [53.5528, 9.9356] },
]

export const DEFAULT_LOCATION = OPERATION_LOCATIONS[0]
