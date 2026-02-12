import { useState, useEffect } from 'react'
import { getFormPermissions, addFormPermission, removeFormPermission, getUsers } from '../api'

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
      // Filter permissions for THIS form
      setPermissions(data.filter(p => p.form === formId))
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
      alert('Permission added successfully')
    } catch (err) {
      setError(err.response?.data?.email?.[0] || 'Failed to share form. Check if user exists.')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="share-modal-overlay" onClick={onClose}>
      <div className="share-modal" onClick={e => e.stopPropagation()}>
        <h3>Manage Permissions</h3>
        
        <div style={{ marginBottom: '1rem' }}>
          <form onSubmit={handleAdd} style={{ display: 'flex', gap: '0.5rem' }}>
             <input 
               type="email" 
               placeholder="User Email" 
               value={selectedUser}
               onChange={e => setSelectedUser(e.target.value)}
               className="form-title-input"
               style={{ fontSize: '0.9rem', flex: 1 }}
               required
             />
             <select 
               value={permissionType} 
               onChange={e => setPermissionType(e.target.value)}
               className="form-title-input"
               style={{ fontSize: '0.9rem' }}
             >
               <option value="view_responses">View Responses</option>
               <option value="edit">Edit Form</option>
             </select>
             <button type="submit" className="btn btn-primary" disabled={adding}>
               {adding ? '+' : 'Add'}
             </button>
          </form>
          {error && <div style={{ color: 'var(--danger)', fontSize: '0.85rem', marginTop: '0.5rem' }}>{error}</div>}
        </div>

        <div className="permissions-list" style={{ maxHeight: '300px', overflowY: 'auto' }}>
          {loading ? (
             <div className="spinner" /> 
           ) : permissions.length === 0 ? (
             <p style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>No users have access to this form.</p>
           ) : (
             <table style={{ width: '100%', borderCollapse: 'collapse' }}>
               <tbody>
                 {permissions.map(p => (
                   <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                     <td style={{ padding: '0.5rem' }}>
                       <div>{p.user_name}</div>
                       <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{p.user_email}</div>
                     </td>
                     <td style={{ padding: '0.5rem' }}>
                       <span style={{ 
                         background: 'var(--bg-secondary)', 
                         padding: '2px 6px', 
                         borderRadius: '4px',
                         fontSize: '0.75rem'
                       }}>
                         {p.permission_type === 'view_responses' ? 'View Responses' : 'Edit'}
                       </span>
                     </td>
                     <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                       <button 
                         className="btn btn-secondary" 
                         style={{ color: 'var(--danger)', borderColor: 'var(--danger)', padding: '2px 6px', fontSize: '0.8rem' }}
                         onClick={() => {
                           if(window.confirm('Remove permission?')) {
                             removeFormPermission(p.id).then(() => {
                               setPermissions(permissions.filter(perm => perm.id !== p.id))
                             })
                           }
                         }}
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

        <div className="share-modal-actions" style={{ marginTop: '1rem' }}>
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
