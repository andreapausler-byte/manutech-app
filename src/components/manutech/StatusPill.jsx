import React from 'react'
import { MT } from './tokens'
import { Pill } from './Pill'

const MAP = {
  aperto:   { tone: 'amber', label: 'APERTO' },
  in_corso: { tone: 'green', label: 'IN CORSO', live: true },
  chiuso:   { tone: 'muted', label: 'CHIUSO' },
}

export function StatusPill({ status }) {
  const s = MAP[status] || MAP.aperto
  return (
    <Pill tone={s.tone} size="sm">
      {s.live && (
        <span style={{
          width: 5, height: 5, borderRadius: 5,
          background: MT.greenLight, animation: 'mt-pulse 1.6s infinite',
        }}/>
      )}
      {s.label}
    </Pill>
  )
}
