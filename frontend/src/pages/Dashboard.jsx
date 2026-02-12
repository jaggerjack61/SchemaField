import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getForms, deleteForm } from '../api'

import FormPermissions from '../components/FormPermissions'

export default function Dashboard() {
  const [forms, setForms] = useState([])
  const [loading, setLoading] = useState(true)
  const [confirmId, setConfirmId] = useState(null)
  const [shareForm, setShareForm] = useState(null)
  const [managePermissionsId, setManagePermissionsId] = useState(null)
  const [toast, setToast] = useState(null)
  const [copied, setCopied] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    loadForms()
  }, [])

  async function loadForms() {
    try {
      const { data } = await getForms()
      setForms(data)
    } catch (err) {
      showToast('Failed to load forms', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    try {
      await deleteForm(confirmId)
      setForms(forms.filter((f) => f.id !== confirmId))
      showToast('Form deleted successfully', 'success')
    } catch (err) {
      showToast('Failed to delete form', 'error')
    } finally {
      setConfirmId(null)
    }
  }

  function showToast(message, type) {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  function handleShareClick(form) {
    setCopied(false)
    setShareForm(form)
  }

  function getShareUrl(form) {
    return `${window.location.origin}/f/${form.share_id}`
  }

  function copyShareLink() {
    navigator.clipboard.writeText(getShareUrl(shareForm))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <h1>My Forms</h1>
          <span className="form-count">{forms.length} form{forms.length !== 1 ? 's' : ''}</span>
        </div>
        <Link to="/forms/new" className="btn btn-primary">
          + Create Form
        </Link>
      </div>

      {forms.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📝</div>
          <h2>No forms yet</h2>
          <p>Create your first form to get started!</p>
          <Link to="/forms/new" className="btn btn-primary">
            + Create Form
          </Link>
        </div>
      ) : (
        <div className="forms-grid">
          {forms.map((form) => (
            <div
              key={form.id}
              className="form-card"
              onClick={() => navigate(`/forms/${form.id}/preview`)}
            >
              <div className="form-card-title">{form.title}</div>
              {form.description && (
                <div className="form-card-desc">{form.description}</div>
              )}
                <div className="form-card-meta">
                <span>📋 {form.section_count} section{form.section_count !== 1 ? 's' : ''}</span>
                <span>❓ {form.question_count} question{form.question_count !== 1 ? 's' : ''}</span>
                <span>🕐 {formatDate(form.updated_at)}</span>
              </div>
              
              <div style={{ marginTop: '0.5rem' }}>
                 {form.is_woned ? (
                   <span style={{ fontSize: '0.75rem', background: 'rgba(124, 92, 252, 0.2)', color: '#a78bfa', padding: '2px 6px', borderRadius: '4px' }}>Owned</span>
                 ) : (
                   <span style={{ fontSize: '0.75rem', background: 'rgba(255, 255, 255, 0.1)', color: '#ccc', padding: '2px 6px', borderRadius: '4px' }}>
                     Shared by {form.owner_name}
                   </span>
                 )}
              </div>

              <div className="form-card-actions" onClick={(e) => e.stopPropagation()}>
                {(form.is_woned || form.user_permissions.includes('edit')) && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => navigate(`/forms/${form.id}/edit`)}
                    title="Edit Form"
                  >
                    ✏️ Edit
                  </button>
                )}
                <button
                  className="btn btn-secondary"
                  onClick={() => navigate(`/forms/${form.id}/responses`)}
                  title="View Responses"
                >
                  📊 Responses
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => handleShareClick(form)}
                  title="Share Link"
                >
                  🔗 Share
                </button>
                
                {form.is_woned && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => setManagePermissionsId(form.id)}
                    title="Manage Permissions"
                  >
                    👥 Users
                  </button>
                )}

                {form.is_woned && (
                  <button
                    className="btn btn-danger"
                    onClick={() => setConfirmId(form.id)}
                    title="Delete Form"
                  >
                    🗑 Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Share Modal */}
      {shareForm && (
        <div className="share-modal-overlay" onClick={() => setShareForm(null)}>
          <div className="share-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Share "{shareForm.title}"</h3>

            {shareForm.qr_code && (
              <div className="qr-container">
                <img src={shareForm.qr_code} alt="QR Code" />
              </div>
            )}

            <div className="share-link-box">
              <input
                type="text"
                value={getShareUrl(shareForm)}
                readOnly
                onClick={(e) => e.target.select()}
              />
              <button className="btn btn-primary" onClick={copyShareLink}>
                {copied ? '✅ Copied!' : '📋 Copy'}
              </button>
            </div>

            <div className="share-modal-actions">
              <button className="btn btn-secondary" onClick={() => setShareForm(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {confirmId && (
        <div className="confirm-overlay" onClick={() => setConfirmId(null)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Form</h3>
            <p>Are you sure you want to delete this form? This action cannot be undone.</p>
            <div className="confirm-actions">
              <button className="btn btn-secondary" onClick={() => setConfirmId(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={handleDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Permissions Modal */}
      {managePermissionsId && (
        <FormPermissions 
          formId={managePermissionsId} 
          onClose={() => setManagePermissionsId(null)} 
        />
      )}

      {/* Toast notification */}
      {toast && (
        <div className={`toast ${toast.type}`}>{toast.message}</div>
      )}
    </div>
  )
}
