import type { StaffProtocolRisk } from '../../types'

const RISK_LEVELS = [
  { label: 'Niedrig', className: 'low', threshold: 1 },
  { label: 'Beobachten', className: 'guarded', threshold: 5 },
  { label: 'Hoch', className: 'high', threshold: 10 },
  { label: 'Kritisch', className: 'critical', threshold: 16 },
] as const

export function getRiskLevel(risk: StaffProtocolRisk) {
  const score = risk.probability * risk.impact
  const level = [...RISK_LEVELS].reverse().find((item) => score >= item.threshold) ?? RISK_LEVELS[0]
  return { ...level, score }
}
