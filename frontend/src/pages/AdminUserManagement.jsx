import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getUsers, createUser, resetUserPassword } from '../api'

export default function AdminUserManagement() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)

  const [newUser, setNewUser] = useState({ email: '', name: '', password: '', role: 'user' })
  const [creating, setCreating] = useState(false)

  const [resetId, setResetId] = useState(null)
  const [newPassword, setNewPassword] = useState('')
  const [resetting, setResetting] = useState(false)

  const [toast, setToast] = useState(null)

  useEffect(() => {
    loadUsers()
  }, [])

  async function loadUsers() {
    try {
      const { data } = await getUsers()
      setUsers(data)
    } catch (err) {
      showToast('Failed to load users', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateUser(e) {
    e.preventDefault()
    setCreating(true)
    try {
      const { data } = await createUser(newUser)
      setUsers([...users, data])
      setShowModal(false)
      setNewUser({ email: '', name: '', password: '', role: 'user' })
      showToast('User created successfully', 'success')
    } catch (err) {
      showToast(err.response?.data?.email?.[0] || 'Failed to create user', 'error')
    } finally {
      setCreating(false)
    }
  }

  async function handleResetPassword(e) {
    e.preventDefault()
    setResetting(true)
    try {
      await resetUserPassword(resetId, newPassword)
      showToast('Password reset successfully', 'success')
      setResetId(null)
      setNewPassword('')
    } catch (err) {
      showToast('Failed to reset password', 'error')
    } finally {
      setResetting(false)
    }
  }

  function showToast(message, type) {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  if (loading) return <div className="loading"><div className="spinner" /></div>

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Admin - User Management</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          + Create User
        </button>
      </div>

      <div className="admin-view-switch">
        <Link to="/admin/users" className="btn btn-primary">User Management</Link>
        <Link to="/admin/files" className="btn btn-secondary">File Management</Link>
      </div>

      <div className="form-card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '1rem' }}>Name</th>
              <th style={{ padding: '1rem' }}>Email</th>
              <th style={{ padding: '1rem' }}>Role</th>
              <th style={{ padding: '1rem' }}>Status</th>
              <th style={{ padding: '1rem' }}>Joined</th>
              <th style={{ padding: '1rem' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '1rem' }}>{user.name}</td>
                <td style={{ padding: '1rem' }}>{user.email}</td>
                <td style={{ padding: '1rem' }}>
                  <span style={{
                    background: user.role === 'admin' ? 'var(--primary)' : 'var(--bg-secondary)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '0.8rem'
                  }}>
                    {user.role}
                  </span>
                </td>
                <td style={{ padding: '1rem' }}>{user.is_active ? 'Active' : 'Inactive'}</td>
                <td style={{ padding: '1rem' }}>{new Date(user.date_joined).toLocaleDateString()}</td>
                <td style={{ padding: '1rem' }}>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                    onClick={() => setResetId(user.id)}
                  >
                    Reset Pass
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="share-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="share-modal" onClick={e => e.stopPropagation()}>
            <h3>Create New User</h3>
            <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <input
                type="text"
                placeholder="Name"
                value={newUser.name}
                onChange={e => setNewUser({ ...newUser, name: e.target.value })}
                required
                className="form-title-input"
                style={{ fontSize: '1rem' }}
              />
              <input
                type="email"
                placeholder="Email"
                value={newUser.email}
                onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                required
                className="form-title-input"
                style={{ fontSize: '1rem' }}
              />
              <input
                type="password"
                placeholder="Password"
                value={newUser.password}
                onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                required
                className="form-title-input"
                style={{ fontSize: '1rem' }}
              />
              <select
                value={newUser.role}
                onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                className="form-title-input"
                style={{ fontSize: '1rem' }}
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>

              <div className="share-modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resetId && (
        <div className="share-modal-overlay" onClick={() => setResetId(null)}>
          <div className="share-modal" onClick={e => e.stopPropagation()}>
            <h3>Reset Password</h3>
            <p>Enter new password for user ID {resetId}</p>
            <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <input
                type="text"
                placeholder="New Password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                className="form-title-input"
                style={{ fontSize: '1rem' }}
              />
              <div className="share-modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setResetId(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={resetting}>
                  {resetting ? 'Resetting...' : 'Reset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </div>
  )
}
