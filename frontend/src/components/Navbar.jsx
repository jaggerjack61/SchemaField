import { useState, useRef, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Navbar() {
  const location = useLocation()
  const { user, logout, isAdmin } = useAuth()
  const isLogin = location.pathname === '/login'
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Close dropdown on navigation
  useEffect(() => {
    setDropdownOpen(false)
  }, [location.pathname])

  if (isLogin) return null

  return (
    <nav className="navbar">
      <Link to="/" className="navbar-brand">
        <span className="logo-icon">S</span>
        SchemaField
      </Link>
      <div className="navbar-links">
        {user ? (
          <div className="navbar-dropdown" ref={dropdownRef}>
            <button
              className="navbar-dropdown-trigger"
              onClick={() => setDropdownOpen(prev => !prev)}
            >
              {user.email}
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ marginLeft: 6, transition: 'transform 0.2s', transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0)' }}>
                <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {dropdownOpen && (
              <div className="navbar-dropdown-menu">
                <Link to="/dashboard" className="navbar-dropdown-item">
                  Dashboard
                </Link>
                <Link to="/profile" className="navbar-dropdown-item">
                  Account Settings
                </Link>
                {isAdmin && (
                  <Link to="/admin/users" className="navbar-dropdown-item">
                    🛡️ Admin
                  </Link>
                )}
                <div className="navbar-dropdown-divider" />
                <button onClick={logout} className="navbar-dropdown-item">
                  Logout
                </button>
              </div>
            )}
          </div>
        ) : (
          <Link to="/login" className="btn btn-primary">
            Login / Register
          </Link>
        )}
      </div>
    </nav>
  )
}
