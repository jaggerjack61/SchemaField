import { useState, useEffect } from 'react'
import { CircleAlert, UserPlus, UsersRound, X } from 'lucide-react'
import { getFormPermissions, addFormPermission, removeFormPermission } from '../api'
import Modal from './Modal'
import { useConfirm } from './ConfirmDialog'
import { getInitials } from '../initials'

// DRF errors are either {detail: '...'} or {field: ['...']}; show the first message.
function errorMessage(err, fallback) {
  const data = err.response?.data
  if (!data || typeof data !== 'object') return fallback
  const value = data.detail ?? Object.values(data)[0]
  return (Array.isArray(value) ? value[0] : value) || fallback
}

export default function FormPermissions({ formId, onClose }) {
  const [permissions, setPermissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  
  const [selectedUser, setSelectedUser] = useState('')
  const [permissionType, setPermissionType] = useState('view_responses')
  const [error, setError] = useState('')
  const [confirm, confirmDialog] = useConfirm()

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const { data } = await getFormPermissions(formId)
      // API returns paginated response: { results: [...] } or plain array
      const allPermissions = data.results || data
      // Filter permissions for THIS form
      setPermissions(allPermissions.filter(p => p.form === formId))
    } catch (err) {
      console.error('Failed to load permissions')
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd(e) {
    e.preventDefault()
    setAdding(true)
    setError('')

    try {
      await addFormPermission({
        form: formId,
        email: selectedUser,
        permission_type: permissionType
      })
      
      await loadData()
      setSelectedUser('')
    } catch (err) {
      setError(errorMessage(err, 'Failed to share form.'))
    } finally {
      setAdding(false)
    }
  }

  async function handleRemove(permission) {
    const confirmed = await confirm({
      title: 'Remove access?',
      message: `${permission.user_name || permission.user_email} will no longer be able to access this form.`,
      confirmLabel: 'Remove access',
      tone: 'danger',
    })
    if (!confirmed) return
    const id = permission.id
    setError('')
    try {
      await removeFormPermission(id)
      setPermissions(current => current.filter(p => p.id !== id))
    } catch (err) {
      setError(errorMessage(err, 'Failed to remove permission.'))
    }
  }

  return (
    <Modal
      title="Manage access"
      description="Give teammates access to edit this form or view its responses."
      icon={<UsersRound />}
      size="lg"
      onClose={onClose}
      footer={<button className="btn btn-secondary" onClick={onClose}>Done</button>}
    >
      <form onSubmit={handleAdd} className="permissions-form">
        <input
          type="email"
          className="input"
          placeholder="User Email"
          aria-label="User email"
          value={selectedUser}
          onChange={e => setSelectedUser(e.target.value)}
          required
        />
        <select
          className="select permissions-type"
          aria-label="Access level"
          value={permissionType}
          onChange={e => setPermissionType(e.target.value)}
        >
          <option value="view_responses">Can view responses</option>
          <option value="edit">Can edit form</option>
        </select>
        <button type="submit" className="btn btn-primary" disabled={adding}>
          <UserPlus aria-hidden="true" />
          {adding ? 'Adding…' : 'Add'}
        </button>
      </form>

      {error && (
        <div className="alert alert-danger permissions-error" role="alert">
          <CircleAlert aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <div className="permissions-list">
        <div className="permissions-list-label">People with access</div>
        {loading ? (
          <div className="loading permissions-loading"><div className="spinner" /></div>
        ) : permissions.length === 0 ? (
          <p className="permissions-empty">Only you can access this form.</p>
        ) : (
          <ul>
            {permissions.map(p => (
              <li key={p.id} className="permissions-row">
                <span className="avatar">{getInitials(p.user_name, p.user_email)}</span>
                <div className="permissions-user">
                  <div className="permissions-user-name">{p.user_name || p.user_email}</div>
                  <div className="permissions-user-email">{p.user_email}</div>
                </div>
                <span className={`badge ${p.permission_type === 'edit' ? 'badge-accent' : ''}`}>
                  {p.permission_type === 'view_responses' ? 'View responses' : 'Edit'}
                </span>
                <button
                  className="btn btn-ghost-danger btn-sm btn-icon"
                  onClick={() => handleRemove(p)}
                  aria-label={`Remove access for ${p.user_email}`}
                  title="Remove access"
                >
                  <X aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {confirmDialog}
    </Modal>
  )
}
