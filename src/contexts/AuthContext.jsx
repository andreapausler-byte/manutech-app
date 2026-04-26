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

  const acceptInvite = async ({ token, password }) => {
    const result = await db.acceptInvite({ token, password })
    if (result.profile) setUser(result.profile)
    return result
  }

  const signupOrganization = async ({ orgName, email, password, adminName }) => {
    const result = await db.signupOrganization({ orgName, email, password, adminName })
    if (result.profile) setUser(result.profile)
    return result
  }

  const logout = async () => {
    await db.logout()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, acceptInvite, signupOrganization, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve essere usato dentro AuthProvider')
  return ctx
}
