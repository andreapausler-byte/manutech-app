import { createContext, useContext } from 'react'

export const V6NavContext = createContext({
  route: { name: 'command' },
  navigate: () => {},
})

export function useV6Nav() {
  return useContext(V6NavContext)
}
