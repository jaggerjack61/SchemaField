import { useState, useEffect } from 'react'
import { KeyRound, Pencil, Search, UserPlus } from 'lucide-react'
import { getUsers, createUser, updateUser, resetUserPassword } from '../api'
import PageHeader from '../components/PageHeader'
import AdminNav from '../components/AdminNav'
import Modal from '../components/Modal'
import Toast, { useToast } from '../components/Toast'
import { getInitials } from '../initials'

export default function AdminUserManagement() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [showModal, setShowModal] = useState(false)

  const [newUser, setNewUser] = useState({ email: '', name: '', password: '', role: 'user' })
  const [creating, setCreating] = useState(false)

  const [resetId, setResetId] = useState(null)
  const [newPassword, setNewPassword] = useState('')
  const [resetting, setResetting] = useState(false)

  const [editUser, setEditUser] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', email: '', role: 'user' })
  const [saving, setSaving] = useState(false)

  const [toast, showToast] = useToast()

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    // Abort the previous search so a slow response can't overwrite a newer one.
    const controller = new AbortController()
    setLoading(true)
    getUsers(debouncedSearch, controller.signal)
      .then(({ data }) => setUsers(data.results ?? data))
      .catch(() => { if (!controller.signal.aborted) showToast('Failed to load users', 'error') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [debouncedSearch, showToast])

  async function handleCreateUser(e) {
    e.preventDefault()
    setCreating(true)
    try {
      const { data } = await createUser(newUser)
      // Newest first, matching the server's ordering.
      setUsers(current => [data, ...current])
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

  function openEditModal(user) {
    setEditUser(user)
    setEditForm({ name: user.name, email: user.email, role: user.role })
  }

  async function handleEditUser(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const { data } = await updateUser(editUser.id, editForm)
      setUsers(current => current.map(u => u.id === data.id ? data : u))
      setEditUser(null)
      showToast('User updated successfully', 'success')
    } catch (err) {
      showToast(err.response?.data?.email?.[0] || 'Failed to update user', 'error')
    } finally {
      setSaving(false)
    }
  }

  const resetUser = users.find(u => u.id === resetId)

  return (
    <div className="admin-page">
      <PageHeader
        title="Admin"
        subtitle="Manage user accounts and stored files."
        actions={
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <UserPlus aria-hidden="true" /> Create User
          </button>
        }
      />
      <AdminNav />

      <div className="card">
        <div className="card-header">
          <div className="input-with-icon admin-search">
            <Search aria-hidden="true" />
            <input
              type="search"
              placeholder="Search users by name or email..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="input"
              aria-label="Search users"
            />
          </div>
          {!loading && (
            <span className="text-muted admin-count">
              {users.length} user{users.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Status</th>
                <th>Joined</th>
                <th className="cell-actions"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" className="table-message">
                    <div className="loading admin-table-loading">
                      <div className="spinner" />
                    </div>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan="5" className="table-message">
                    No users found.
                  </td>
                </tr>
              ) : (
                users.map(user => (
                  <tr key={user.id}>
                    <td>
                      <div className="user-cell">
                        <span className="avatar">{getInitials(user.name, user.email)}</span>
                        <div className="user-cell-text">
                          <div className="user-cell-name">{user.name}</div>
                          <div className="user-cell-email">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${user.role === 'admin' ? 'badge-accent' : ''}`}>
                        {user.role}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-dot ${user.is_active ? 'badge-success' : ''}`}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="cell-muted">{new Date(user.date_joined).toLocaleDateString()}</td>
                    <td className="cell-actions">
                      <div className="row-actions">
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => setResetId(user.id)}
                        >
                          <KeyRound aria-hidden="true" />
                          Reset Password
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => openEditModal(user)}
                        >
                          <Pencil aria-hidden="true" />
                          Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <Modal
          title="Create user"
          description="The new user can sign in immediately with this email and password."
          icon={<UserPlus />}
          onClose={() => setShowModal(false)}
          onSubmit={handleCreateUser}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={creating}>
                {creating ? 'Creating…' : 'Create'}
              </button>
            </>
          }
        >
          <div className="modal-form">
            <div className="field">
              <label className="field-label" htmlFor="new-user-name">Name</label>
              <input
                id="new-user-name"
                type="text"
                placeholder="Jane Doe"
                value={newUser.name}
                onChange={e => setNewUser({ ...newUser, name: e.target.value })}
                required
                autoFocus
                className="input"
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="new-user-email">Email</label>
              <input
                id="new-user-email"
                type="email"
                placeholder="jane@company.com"
                value={newUser.email}
                onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                required
                className="input"
              />
            </div>
            <div className="field-row">
              <div className="field">
                <label className="field-label" htmlFor="new-user-password">Password</label>
                <input
                  id="new-user-password"
                  type="password"
                  autoComplete="new-password"
                  value={newUser.password}
                  onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                  required
                  className="input"
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="new-user-role">Role</label>
                <select
                  id="new-user-role"
                  value={newUser.role}
                  onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                  className="select"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {resetId && (
        <Modal
          title="Reset password"
          description={resetUser
            ? `Set a new password for ${resetUser.name || resetUser.email}. They’ll need to use it the next time they sign in.`
            : 'Set a new password for this user.'}
          icon={<KeyRound />}
          size="sm"
          onClose={() => setResetId(null)}
          onSubmit={handleResetPassword}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setResetId(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={resetting}>
                {resetting ? 'Updating…' : 'Update Password'}
              </button>
            </>
          }
        >
          <div className="field">
            <label className="field-label" htmlFor="reset-password">New password</label>
            <input
              id="reset-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              required
              autoFocus
              className="input"
            />
          </div>
        </Modal>
      )}

      {editUser && (
        <Modal
          title="Edit user"
          icon={<Pencil />}
          onClose={() => setEditUser(null)}
          onSubmit={handleEditUser}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setEditUser(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </>
          }
        >
          <div className="modal-form">
            <div className="field">
              <label className="field-label" htmlFor="edit-user-name">Name</label>
              <input
                id="edit-user-name"
                type="text"
                value={editForm.name}
                onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                required
                className="input"
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="edit-user-email">Email</label>
              <input
                id="edit-user-email"
                type="email"
                value={editForm.email}
                onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                required
                className="input"
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="edit-user-role">Role</label>
              <select
                id="edit-user-role"
                value={editForm.role}
                onChange={e => setEditForm({ ...editForm, role: e.target.value })}
                className="select"
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
        </Modal>
      )}

      <Toast toast={toast} />
    </div>
  )
}
