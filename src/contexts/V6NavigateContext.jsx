import { createContext, useContext } from 'react'

const V6NavigateContext = createContext(null)

export const V6NavigateProvider = V6NavigateContext.Provider

// eslint-disable-next-line react-refresh/only-export-components
export function useV6Navigate() {
  return useContext(V6NavigateContext) || (() => {})
}
