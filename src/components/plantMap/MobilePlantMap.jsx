// Mappa impianto sul telefono, dentro il tab Macchine: alta quanto resta
// dello schermo tra la barra in alto e quella in basso, così si trascina
// la planimetria e non la pagina.

import { useLayoutEffect, useRef, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { usePlantMapData } from '../../hooks/usePlantMapData'
import { getPlantForOrg } from '../../lib/plantMap/plants'
import PlantMap from './PlantMap'

export default function MobilePlantMap({ onOpenMachine, onOpenReport }) {
  const { user } = useAuth()
  const plant = getPlantForOrg(user?.org_id)
  const data = usePlantMapData(user)
  const boxRef = useRef(null)
  const [height, setHeight] = useState(null)

  useLayoutEffect(() => {
    const upd = () => {
      const el = boxRef.current
      if (!el) return
      const main = el.closest('main')
      if (main && main.scrollTop) main.scrollTop = 0
      const top = el.getBoundingClientRect().top
      const nav = document.querySelector('nav[aria-label="Navigazione principale"]')
      const navH = nav ? nav.getBoundingClientRect().height : 64
      setHeight(Math.max(360, Math.round(window.innerHeight - top - navH - 8)))
    }
    upd()
    window.addEventListener('resize', upd)
    return () => window.removeEventListener('resize', upd)
  }, [])

  if (!plant) return null
  return (
    <div ref={boxRef} style={{ height: height || '70vh' }}>
      <PlantMap
        plant={plant}
        data={data}
        canEdit={user?.role === 'admin' || user?.role === 'tecnico'}
        onOpenMachine={onOpenMachine}
        onOpenReport={onOpenReport}
      />
    </div>
  )
}
