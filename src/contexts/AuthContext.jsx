import { createContext, useContext, useState, useEffect } from 'react'
import { db, ensureDefaultAdmin } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ensureDefaultAdmin()
    db.getSession().then(session => {
      setUser(session)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const login = async (email, password) => {
    const user = await db.login(email, password)
    setUser(user)
    return user
  }

  const register = async (userData) => {
    const user = await db.register(userData)
    setUser(user)
    return user
  }

  const logout = async () => {
    await db.logout()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve essere usato dentro AuthProvider')
  return ctx
}
