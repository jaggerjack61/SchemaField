import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getForms, deleteForm, archiveForm, restoreForm } from '../api'

import FormPermissions from '../components/FormPermissions'

const FORMS_PAGE_SIZE = 12

export default function Dashboard() {
  const [forms, setForms] = useState([])
  const [searchInput, setSearchInput] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState('card')
  const [activeTab, setActiveTab] = useState('active')
  const [visibleCount, setVisibleCount] = useState(FORMS_PAGE_SIZE)
  const [loading, setLoading] = useState(true)
  const [confirmId, setConfirmId] = useState(null)
  const [shareForm, setShareForm] = useState(null)
  const [managePermissionsId, setManagePermissionsId] = useState(null)
  const [toast, setToast] = useState(null)
  const [copied, setCopied] = useState(false)
  const [openMenuId, setOpenMenuId] = useState(null)
  const lazyLoaderRef = useRef(null)

  // Close overflow menu when clicking outside
  useEffect(() => {
    if (!openMenuId) return
    function handleClick() {
      setOpenMenuId(null)
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [openMenuId])
  const navigate = useNavigate()

  useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(searchInput), 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const { data } = await getForms()
        if (!cancelled) setForms(data.results || data)
      } catch (err) {
        if (!cancelled) showToast('Failed to load forms', 'error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

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

  async function handleArchive(id) {
    try {
      await archiveForm(id)
      setForms(forms.map((f) => f.id === id ? { ...f, is_archived: true } : f))
      showToast('Form archived', 'success')
    } catch (err) {
      showToast('Failed to archive form', 'error')
    }
  }

  async function handleRestore(id) {
    try {
      await restoreForm(id)
      setForms(forms.map((f) => f.id === id ? { ...f, is_archived: false } : f))
      showToast('Form restored', 'success')
    } catch (err) {
      showToast('Failed to restore form', 'error')
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
    if (activeTab === 'active' && form.is_archived) return false
    if (activeTab === 'archived' && !form.is_archived) return false
    if (!normalizedSearchTerm) {
      return true
    }

    return [form.title, form.description, form.owner_name]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(normalizedSearchTerm))
  }).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
  const visibleForms = filteredForms.slice(0, visibleCount)
  const hasMoreForms = visibleCount < filteredForms.length

  useEffect(() => {
    setVisibleCount(FORMS_PAGE_SIZE)
  }, [searchTerm, activeTab])

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

      <div className="dashboard-tabs">
        <button
          type="button"
          className={`tab-btn ${activeTab === 'active' ? 'active' : ''}`}
          onClick={() => setActiveTab('active')}
        >
          📋 Active
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'archived' ? 'active' : ''}`}
          onClick={() => setActiveTab('archived')}
        >
          📦 Archived
        </button>
      </div>

      <div className="dashboard-controls">
        <input
          type="text"
          className="dashboard-search"
          placeholder="Search forms..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
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
          <div className="empty-icon">{activeTab === 'archived' ? '📦' : '📝'}</div>
          {forms.length === 0 ? (
            <>
              <h2>No forms yet</h2>
              <p>Create your first form to get started!</p>
              <Link to="/forms/new" className="btn btn-primary">
                + Create Form
              </Link>
            </>
          ) : activeTab === 'archived' ? (
            <>
              <h2>No archived forms</h2>
              <p>Forms you archive will appear here.</p>
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
                <span>✅ {form.response_count} response{form.response_count !== 1 ? 's' : ''}</span>
                <span>🕐 {formatDate(form.updated_at)}</span>
              </div>
              
              <div className="form-card-badge">
                 {form.is_owned ? (
                   <span className="badge-owned">Owned</span>
                 ) : (
                   <span className="badge-shared">
                     Shared by {form.owner_name}
                   </span>
                 )}
              </div>

              <div className="form-card-actions" onClick={(e) => e.stopPropagation()}>
                {(form.is_owned || form.user_permissions.includes('edit')) && (
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

                <div className="form-card-actions-more">
                  <button
                    className="btn-more-toggle"
                    onClick={(e) => {
                      e.stopPropagation()
                      setOpenMenuId(openMenuId === form.id ? null : form.id)
                    }}
                    title="More actions"
                    aria-label="More actions"
                    aria-expanded={openMenuId === form.id}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                      <circle cx="12" cy="5" r="1.5" />
                      <circle cx="12" cy="12" r="1.5" />
                      <circle cx="12" cy="19" r="1.5" />
                    </svg>
                  </button>

                  {openMenuId === form.id && (
                    <div className="dropdown-menu" onClick={(e) => e.stopPropagation()}>
                      {form.is_owned && (
                        <button
                          className="dropdown-item"
                          onClick={() => setManagePermissionsId(form.id)}
                        >
                          👥 Users
                        </button>
                      )}
                      {form.is_archived ? (
                        <button
                          className="dropdown-item"
                          onClick={() => handleRestore(form.id)}
                        >
                          ♻️ Restore
                        </button>
                      ) : (
                        <button
                          className="dropdown-item"
                          onClick={() => handleArchive(form.id)}
                        >
                          📦 Archive
                        </button>
                      )}
                      {form.is_owned && (
                        <div className="dropdown-divider" />
                      )}
                      {form.is_owned && (
                        <button
                          className="dropdown-item dropdown-item-danger"
                          onClick={() => setConfirmId(form.id)}
                        >
                          🗑 Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
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
              <button className="btn btn-danger" onClick={handleDelete}>
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
