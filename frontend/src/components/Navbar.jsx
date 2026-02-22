import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Navbar() {
  const location = useLocation()
  const { user, logout, isAdmin } = useAuth()
  const isHome = location.pathname === '/'
  const isLogin = location.pathname === '/login'

  if (isLogin) return null

  return (
    <nav className="navbar">
      <Link to="/" className="navbar-brand">
        <span className="logo-icon">S</span>
        SchemaField
      </Link>
      <div className="navbar-links">
        {user ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginRight: '1rem' }}>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{user.email}</span>
              {isAdmin && (
                <Link to="/admin/users" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}>
                  🛡️ Admin
                </Link>
              )}
              <Link to="/dashboard" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}>
                Dashboard
              </Link>
              <button onClick={logout} className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}>
                Logout
              </button>
            </div>
          </>
        ) : (
          <Link to="/login" className="btn btn-primary">
            Login / Register
          </Link>
        )}
        
      </div>
    </nav>
  )
}
