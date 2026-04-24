import React, { useCallback, useMemo, useState } from 'react'
import { Shell } from '../../components/manutech'
import { V6NavContext } from './V6Nav'
import CommandCenter from './CommandCenter'
import TicketBoard from './TicketBoard'
import TicketDetail from './TicketDetail'

// route shapes:
// { name: 'command' }
// { name: 'tickets' }
// { name: 'ticket-detail', id: 'TK-2847' }

export default function V6App({ onExit, userName }) {
  const [route, setRoute] = useState({ name: 'command' })

  const navigate = useCallback((name, params = {}) => {
    setRoute({ name, ...params })
  }, [])

  const nav = useMemo(() => ({ route, navigate }), [route, navigate])

  const activeRoute = route.name === 'ticket-detail' ? 'tickets' : route.name

  return (
    <V6NavContext.Provider value={nav}>
      <div className="mt-scope" style={{ minHeight: '100vh' }}>
        <Shell
          activeRoute={activeRoute}
          onNavigate={(r) => navigate(r)}
          onExit={onExit}
          userName={userName}
        >
          {route.name === 'command' && <CommandCenter />}
          {route.name === 'tickets' && <TicketBoard />}
          {route.name === 'ticket-detail' && <TicketDetail id={route.id} />}
        </Shell>
      </div>
    </V6NavContext.Provider>
  )
}
