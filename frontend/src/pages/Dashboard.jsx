import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getForms, deleteForm } from '../api'

import FormPermissions from '../components/FormPermissions'

const FORMS_PAGE_SIZE = 12

export default function Dashboard() {
  const [forms, setForms] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState('card')
  const [visibleCount, setVisibleCount] = useState(FORMS_PAGE_SIZE)
  const [loading, setLoading] = useState(true)
  const [confirmId, setConfirmId] = useState(null)
  const [shareForm, setShareForm] = useState(null)
  const [managePermissionsId, setManagePermissionsId] = useState(null)
  const [toast, setToast] = useState(null)
  const [copied, setCopied] = useState(false)
  const lazyLoaderRef = useRef(null)
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

  const normalizedSearchTerm = searchTerm.trim().toLowerCase()
  const filteredForms = forms.filter((form) => {
    if (!normalizedSearchTerm) {
      return true
    }

    return [form.title, form.description, form.owner_name]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(normalizedSearchTerm))
  })
  const visibleForms = filteredForms.slice(0, visibleCount)
  const hasMoreForms = visibleCount < filteredForms.length

  useEffect(() => {
    setVisibleCount(FORMS_PAGE_SIZE)
  }, [searchTerm])

  useEffect(() => {
    if (!hasMoreForms || !lazyLoaderRef.current) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((count) => Math.min(count + FORMS_PAGE_SIZE, filteredForms.length))
        }
      },
      { rootMargin: '200px 0px' }
    )

    observer.observe(lazyLoaderRef.current)

    return () => observer.disconnect()
  }, [hasMoreForms, filteredForms.length])

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
          <span className="form-count">{filteredForms.length} of {forms.length} form{forms.length !== 1 ? 's' : ''}</span>
        </div>
        <Link to="/forms/new" className="btn btn-primary">
          + Create Form
        </Link>
      </div>

      <div className="dashboard-controls">
        <input
          type="text"
          className="dashboard-search"
          placeholder="Search forms..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          aria-label="Search forms"
        />
        <div className="view-toggle" role="group" aria-label="View mode">
          <button
            type="button"
            className={`btn btn-secondary ${viewMode === 'card' ? 'active' : ''}`}
            onClick={() => setViewMode('card')}
            title="Card / icon view"
            aria-label="Card / icon view"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="view-icon">
              <rect x="3" y="3" width="8" height="8" rx="1.5" />
              <rect x="13" y="3" width="8" height="8" rx="1.5" />
              <rect x="3" y="13" width="8" height="8" rx="1.5" />
              <rect x="13" y="13" width="8" height="8" rx="1.5" />
            </svg>
          </button>
          <button
            type="button"
            className={`btn btn-secondary ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => setViewMode('list')}
            title="List / detail view"
            aria-label="List / detail view"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="view-icon">
              <path d="M4 6h16" />
              <path d="M4 12h16" />
              <path d="M4 18h16" />
            </svg>
          </button>
        </div>
      </div>

      {filteredForms.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📝</div>
          {forms.length === 0 ? (
            <>
              <h2>No forms yet</h2>
              <p>Create your first form to get started!</p>
              <Link to="/forms/new" className="btn btn-primary">
                + Create Form
              </Link>
            </>
          ) : (
            <>
              <h2>No forms found</h2>
              <p>Try a different search term.</p>
            </>
          )}
        </div>
      ) : (
        <div className={`forms-grid ${viewMode === 'list' ? 'forms-list' : ''}`}>
          {visibleForms.map((form) => (
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

      {hasMoreForms && (
        <div className="forms-lazy-loader" ref={lazyLoaderRef} aria-live="polite">
          Loading more forms...
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
