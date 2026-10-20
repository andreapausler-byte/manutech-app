/**
 * AdminPlantMap — la mappa impianto nella console, a tutta pagina.
 *
 * Un clic su una macchina apre il pannello a destra; «Apri scheda
 * macchina» porta a Macchinari con la scheda già aperta, un ticket porta a
 * Segnalazioni con il ticket aperto. Tornando qui la mappa riparte da dove
 * eri (vedi `lastViews` in PlantMap).
 */

import { useLayoutEffect, useRef, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { EmptyState } from '../../components/ui'
import { fMono } from '../../components/manutech'
import PlantMap from '../../components/plantMap/PlantMap'
import { usePlantMapData } from '../../hooks/usePlantMapData'
import { getPlantForOrg } from '../../lib/plantMap/plants'

export default function AdminPlantMap({ onOpenMachine, onOpenReport }) {
  const { user } = useAuth()
  const plant = getPlantForOrg(user?.org_id)
  const data = usePlantMapData(user)
  const boxRef = useRef(null)
  const [height, setHeight] = useState(null)

  // La console scorre col documento: la mappa invece deve stare in uno
  // schermo, sotto la barra in alto.
  useLayoutEffect(() => {
    const upd = () => {
      if (!boxRef.current) return
      const top = boxRef.current.getBoundingClientRect().top + window.scrollY
      setHeight(Math.max(480, window.innerHeight - top))
    }
    upd()
    window.addEventListener('resize', upd)
    return () => window.removeEventListener('resize', upd)
  }, [])

  if (!plant) {
    return (
      <div style={{ padding: '28px 32px' }}>
        <EmptyState icon="🗺️" title="Nessuna planimetria" subtitle="La mappa impianto non è ancora disponibile per questa organizzazione." />
      </div>
    )
  }

  return (
    <div ref={boxRef} style={{ height: height || '78vh', padding: '16px 24px 20px', boxSizing: 'border-box' }}>
      <PlantMap
        plant={plant}
        data={data}
        canEdit
        monoFont={fMono}
        onOpenMachine={onOpenMachine}
        onOpenReport={onOpenReport}
      />
    </div>
  )
}
