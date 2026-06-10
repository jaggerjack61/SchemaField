import { useState, useEffect } from 'react'
import { getFormPermissions, addFormPermission, removeFormPermission } from '../api'

export default function FormPermissions({ formId, onClose }) {
  const [permissions, setPermissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  
  const [selectedUser, setSelectedUser] = useState('')
  const [permissionType, setPermissionType] = useState('view_responses')
  const [error, setError] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const { data } = await getFormPermissions()
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
      
      loadData()
      setSelectedUser('')
    } catch (err) {
      setError(err.response?.data?.email?.[0] || 'Failed to share form. Check if user exists.')
    } finally {
      setAdding(false)
    }
  }

  function handleRemove(id) {
    if (window.confirm('Remove permission?')) {
      removeFormPermission(id).then(() => {
        setPermissions(permissions.filter(p => p.id !== id))
      })
    }
  }

  return (
    <div className="permissions-modal-overlay" onClick={onClose}>
      <div className="permissions-modal" onClick={e => e.stopPropagation()}>
        <h3>Manage Permissions</h3>
        
        <form onSubmit={handleAdd} className="permissions-form">
          <input 
            type="email" 
            placeholder="User Email" 
            value={selectedUser}
            onChange={e => setSelectedUser(e.target.value)}
            required
          />
          <select 
            value={permissionType} 
            onChange={e => setPermissionType(e.target.value)}
          >
            <option value="view_responses">View Responses</option>
            <option value="edit">Edit Form</option>
          </select>
          <button type="submit" className="btn btn-primary" disabled={adding}>
            {adding ? '...' : 'Add'}
          </button>
        </form>
        
        {error && <div className="permissions-error">{error}</div>}

        <div className="permissions-list">
          {loading ? (
            <div className="spinner" style={{ margin: '24px auto' }} />
          ) : permissions.length === 0 ? (
            <p className="permissions-empty">No users have access to this form.</p>
          ) : (
            <table className="permissions-table">
              <tbody>
                {permissions.map(p => (
                  <tr key={p.id}>
                    <td>
                      <div className="permissions-user-name">{p.user_name}</div>
                      <div className="permissions-user-email">{p.user_email}</div>
                    </td>
                    <td>
                      <span className="permissions-badge">
                        {p.permission_type === 'view_responses' ? 'View Responses' : 'Edit'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button 
                        className="btn btn-secondary permissions-remove-btn"
                        onClick={() => handleRemove(p.id)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="permissions-modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
