import { createContext, useContext } from 'react'
import { createPortal } from 'react-dom'

// Lo spazio a destra nella barra in alto della console: una pagina ci mette
// le sue azioni (Nuovo piano, Registra…) invece di una riga di bottoni in più.
const V6TopBarContext = createContext(null)

export const V6TopBarProvider = V6TopBarContext.Provider

// Fuori dalla console, o prima che la barra esista, le azioni restano dove
// sono scritte.
export function V6TopBarActions({ children }) {
  const node = useContext(V6TopBarContext)
  const content = <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{children}</div>
  return node ? createPortal(content, node) : content
}
