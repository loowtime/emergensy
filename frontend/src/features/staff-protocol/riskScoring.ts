import type { StaffProtocolRisk } from '../../types'

const RISK_LEVELS = [
  { label: 'Niedrig', className: 'low', threshold: 1 },
  { label: 'Beobachten', className: 'guarded', threshold: 5 },
  { label: 'Hoch', className: 'high', threshold: 10 },
  { label: 'Kritisch', className: 'critical', threshold: 16 },
] as const

export function getRiskLevel(risk: StaffProtocolRisk) {
  return getRiskLevelForScore(risk.residual_probability * risk.residual_impact)
}

export function getRiskLevelForScore(score: number) {
  const level = [...RISK_LEVELS].reverse().find((item) => score >= item.threshold) ?? RISK_LEVELS[0]
  return { ...level, score }
}

export function getGrossRiskLevel(risk: StaffProtocolRisk) {
  return getRiskLevelForScore(risk.probability * risk.impact)
}

export const RISK_CATEGORY_LABELS = {
  methodology: 'Methodik & Validität',
  data_quality: 'Datenqualität & Reproduzierbarkeit',
  ethics: 'Forschungsethik & Teilnehmende',
  privacy: 'Datenschutz',
  security: 'Informationssicherheit',
  resources: 'Ressourcen & Kompetenzen',
  timeline: 'Zeitplan & Meilensteine',
  dependencies: 'Abhängigkeiten & Infrastruktur',
  transfer: 'Transfer & Wirkung',
  other: 'Sonstiges',
} as const

export const RISK_STATUS_LABELS = {
  identified: 'Identifiziert',
  treating: 'In Behandlung',
  accepted: 'Akzeptiert',
  closed: 'Geschlossen',
} as const

export const RISK_TREATMENT_LABELS = {
  reduce: 'Reduzieren',
  avoid: 'Vermeiden',
  share: 'Teilen',
  accept: 'Akzeptieren',
} as const
