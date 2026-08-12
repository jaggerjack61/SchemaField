import { useState, useRef, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'

export default function Navbar() {
  const location = useLocation()
  const { user, logout, isAdmin } = useAuth()
  const { theme, toggleTheme } = useTheme()
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
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? (
            /* Sun icon */
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
            </svg>
          ) : (
            /* Moon icon */
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>
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
