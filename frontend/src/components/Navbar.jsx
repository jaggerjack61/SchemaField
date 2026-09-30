import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { LayoutGrid, LogOut, Moon, Shield, Sun, UserRound } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import useDismiss from '../hooks/useDismiss'
import Logo from './Logo'
import { getInitials } from '../initials'

export default function Navbar() {
  const location = useLocation()
  const { user, logout, isAdmin } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const closeMenu = useCallback(() => setMenuOpen(false), [])
  useDismiss(menuRef, menuOpen, closeMenu)

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  if (location.pathname === '/login') return null

  // Respondents filling a shared form don't need account navigation.
  const isRespondentView = location.pathname.startsWith('/f/')
  const themeLabel = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link to={user ? '/dashboard' : '/'} className="navbar-brand" aria-label="SchemaField home">
          <Logo />
          <span className="navbar-brand-text">SchemaField</span>
        </Link>

        {user && !isRespondentView && (
          <nav className="navbar-nav" aria-label="Main">
            <NavLink to="/dashboard" className="navbar-link">
              <LayoutGrid aria-hidden="true" />
              <span>Forms</span>
            </NavLink>
            {isAdmin && (
              <NavLink to="/admin" className="navbar-link">
                <Shield aria-hidden="true" />
                <span>Admin</span>
              </NavLink>
            )}
          </nav>
        )}

        <div className="navbar-right">
          <button className="navbar-icon-btn" onClick={toggleTheme} aria-label={themeLabel} title={themeLabel}>
            {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          </button>

          {user && !isRespondentView ? (
            <div className="menu-anchor" ref={menuRef}>
              <button
                className="navbar-user-trigger"
                onClick={() => setMenuOpen(open => !open)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Account menu"
              >
                <span className="avatar avatar-sm">{getInitials(user.name, user.email)}</span>
              </button>
              {menuOpen && (
                <div className="dropdown-menu" role="menu">
                  <div className="dropdown-label">
                    <strong>{user.name || 'Account'}</strong>
                    {user.email}
                  </div>
                  <div className="dropdown-divider" />
                  <Link to="/dashboard" className="dropdown-item" role="menuitem">
                    <LayoutGrid aria-hidden="true" /> Forms
                  </Link>
                  <Link to="/profile" className="dropdown-item" role="menuitem">
                    <UserRound aria-hidden="true" /> Account settings
                  </Link>
                  {isAdmin && (
                    <Link to="/admin/users" className="dropdown-item" role="menuitem">
                      <Shield aria-hidden="true" /> Admin
                    </Link>
                  )}
                  <div className="dropdown-divider" />
                  <button onClick={logout} className="dropdown-item" role="menuitem">
                    <LogOut aria-hidden="true" /> Log out
                  </button>
                </div>
              )}
            </div>
          ) : !user && !isRespondentView ? (
            <Link to="/login" className="btn btn-primary btn-sm">Sign in</Link>
          ) : null}
        </div>
      </div>
    </header>
  )
}
