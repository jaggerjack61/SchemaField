import { NavLink } from 'react-router-dom'
import { HardDrive, UsersRound } from 'lucide-react'

export default function AdminNav() {
  return (
    <nav className="tabs" aria-label="Admin sections">
      <NavLink to="/admin/users" className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`}>
        <UsersRound aria-hidden="true" /> Users
      </NavLink>
      <NavLink to="/admin/files" className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`}>
        <HardDrive aria-hidden="true" /> Files
      </NavLink>
    </nav>
  )
}
