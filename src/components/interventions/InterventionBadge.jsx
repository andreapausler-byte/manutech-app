// Badge piccolo per status / type / severity di un intervento.
// Riusa le palette già definite in src/lib/constants.js (REPORT_TYPES, SEVERITY)
// e src/lib/interventions.js (INTERVENTION_STATUSES).

import {
  INTERVENTION_STATUSES,
  INTERVENTION_TYPES,
  INTERVENTION_SEVERITIES,
} from '../../lib/interventions'

const MAPS = {
  status: INTERVENTION_STATUSES,
  type: INTERVENTION_TYPES,
  severity: INTERVENTION_SEVERITIES,
}

/**
 * <InterventionBadge field="status" value="pianificato" />
 * <InterventionBadge field="type" value="correttiva" />
 * <InterventionBadge field="severity" value="alta" />
 *
 * size: 'sm' (default) | 'md'
 * showIcon: bool — mostra l'icona/emoji se presente nel mapping
 */
export default function InterventionBadge({
  field,
  value,
  size = 'sm',
  showIcon = true,
  label: labelOverride,
}) {
  const map = MAPS[field]
  if (!map || !value) return null
  const meta = map[value]
  if (!meta) return null

  const padding = size === 'md' ? '4px 9px' : '2px 6px'
  const fontSize = size === 'md' ? 12 : 10

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding,
      borderRadius: 999,
      background: meta.bg,
      color: meta.color,
      fontSize,
      fontWeight: 700,
      letterSpacing: 0.2,
      whiteSpace: 'nowrap',
    }}>
      {showIcon && meta.icon && (
        <span style={{ lineHeight: 1 }}>{meta.icon}</span>
      )}
      {labelOverride || meta.label}
    </span>
  )
}
