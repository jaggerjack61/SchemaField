import { createContext, useContext, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { login as apiLogin, getMe } from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    async function loadUser() {
      const token = localStorage.getItem('access_token')
      if (!token) { setLoading(false); return }
      try {
        const { data } = await getMe()
        if (!cancelled) setUser(data)
      } catch {
        if (!cancelled) {
          localStorage.removeItem('access_token')
          localStorage.removeItem('refresh_token')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadUser()
    return () => { cancelled = true }
  }, [])

  async function login(email, password) {
    const { data } = await apiLogin(email, password)
    localStorage.setItem('access_token', data.access)
    localStorage.setItem('refresh_token', data.refresh)
    
    // Get user details immediately
    const userResp = await getMe()
    setUser(userResp.data)
  }

  function logout() {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    setUser(null)
    navigate('/login', { replace: true })
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, isAdmin: user?.role === 'admin' }}>
      {!loading && children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
