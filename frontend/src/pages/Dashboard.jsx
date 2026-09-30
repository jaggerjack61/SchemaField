import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Archive,
  ArchiveRestore,
  ChartColumn,
  Ellipsis,
  Eye,
  FilePlus2,
  FileText,
  LayoutGrid,
  Layers,
  List,
  ListChecks,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  SearchX,
  Share2,
  Trash2,
  UsersRound,
} from 'lucide-react'
import { getFormsPage, deleteForm, archiveForm, restoreForm } from '../api'

import FormPermissions from '../components/FormPermissions'
import ShareModal from '../components/ShareModal'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import Toast, { useToast } from '../components/Toast'
import { useConfirm } from '../components/ConfirmDialog'

const FORMS_PAGE_SIZE = 24

export default function Dashboard() {
  const [forms, setForms] = useState([])
  const [count, setCount] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState('card')
  const [activeTab, setActiveTab] = useState('active')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [shareForm, setShareForm] = useState(null)
  const [managePermissionsId, setManagePermissionsId] = useState(null)
  const [openMenuId, setOpenMenuId] = useState(null)
  const lazyLoaderRef = useRef(null)
  const queryControllerRef = useRef(null)
  const [toast, showToast] = useToast()
  const [confirm, confirmDialog] = useConfirm()

  // Close the overflow menu on any outside click or Escape.
  useEffect(() => {
    if (!openMenuId) return
    function handleClick() {
      setOpenMenuId(null)
    }
    function handleKey(event) {
      if (event.key === 'Escape') setOpenMenuId(null)
    }
    document.addEventListener('click', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('click', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [openMenuId])
  const navigate = useNavigate()

  useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(searchInput.trim()), 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  // Search and the archive tab are applied by the server, so the dashboard
  // only downloads the forms it shows.
  const queryParams = useMemo(() => ({
    archived: activeTab === 'archived' ? 'true' : 'false',
    page_size: FORMS_PAGE_SIZE,
    ...(searchTerm ? { search: searchTerm } : {}),
  }), [activeTab, searchTerm])

  useEffect(() => {
    const controller = new AbortController()
    queryControllerRef.current = controller
    setLoading(true)
    setLoadingMore(false)
    getFormsPage({ ...queryParams, page: 1 }, controller.signal)
      .then(({ data }) => {
        setForms(data.results)
        setCount(data.count)
      })
      .catch(() => { if (!controller.signal.aborted) showToast('Failed to load forms', 'error') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [queryParams, showToast])

  const hasMoreForms = forms.length < count

  const loadMore = useCallback(() => {
    const controller = queryControllerRef.current
    if (!controller) return
    // Derive the page from what is loaded rather than a page counter: after an
    // archive or delete the server's pages shift, and re-reading an overlapping
    // page (deduplicated below) is better than skipping a form.
    const page = Math.floor(forms.length / FORMS_PAGE_SIZE) + 1
    const known = new Set(forms.map(form => form.id))
    setLoadingMore(true)
    getFormsPage({ ...queryParams, page }, controller.signal)
      .then(({ data }) => {
        const added = data.results.filter(form => !known.has(form.id))
        if (added.length === 0) {
          // Nothing new means the list is complete, even if the count says otherwise.
          setCount(forms.length)
          return
        }
        setForms(current => {
          const ids = new Set(current.map(form => form.id))
          return [...current, ...added.filter(form => !ids.has(form.id))]
        })
        setCount(data.count)
      })
      .catch(() => { if (!controller.signal.aborted) showToast('Failed to load more forms', 'error') })
      .finally(() => { if (!controller.signal.aborted) setLoadingMore(false) })
  }, [forms, queryParams, showToast])

  // Re-observe after every batch: IntersectionObserver only reports changes,
  // so a loader that stays on screen after a batch would otherwise never fire again.
  useEffect(() => {
    if (!hasMoreForms || loading || loadingMore || !lazyLoaderRef.current) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore()
      },
      { rootMargin: '200px 0px' }
    )

    observer.observe(lazyLoaderRef.current)

    return () => observer.disconnect()
  }, [hasMoreForms, loading, loadingMore, loadMore])

  function removeFromList(id) {
    setForms(current => current.filter((f) => f.id !== id))
    setCount(current => Math.max(0, current - 1))
  }

  async function handleDelete(form) {
    const confirmed = await confirm({
      title: 'Delete form?',
      message: `“${form.title}” and all of its responses will be permanently deleted. This can’t be undone.`,
      confirmLabel: 'Delete form',
      tone: 'danger',
    })
    if (!confirmed) return
    try {
      await deleteForm(form.id)
      removeFromList(form.id)
      showToast('Form deleted', 'success')
    } catch (err) {
      showToast('Failed to delete form', 'error')
    }
  }

  // Archiving moves the form to the other tab, so it leaves the current list.
  async function handleArchive(id) {
    try {
      await archiveForm(id)
      removeFromList(id)
      showToast('Form archived', 'success')
    } catch (err) {
      showToast('Failed to archive form', 'error')
    }
  }

  async function handleRestore(id) {
    try {
      await restoreForm(id)
      removeFromList(id)
      showToast('Form restored', 'success')
    } catch (err) {
      showToast('Failed to restore form', 'error')
    }
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  function runMenuAction(action) {
    setOpenMenuId(null)
    action()
  }

  function plural(n, word) {
    return `${n} ${word}${n !== 1 ? 's' : ''}`
  }

  const isArchived = activeTab === 'archived'

  return (
    <div className="dashboard">
      <PageHeader
        title="Forms"
        subtitle={loading ? 'Loading…' : plural(count, 'form')}
        actions={
          <Link to="/forms/new" className="btn btn-primary">
            <Plus aria-hidden="true" /> Create Form
          </Link>
        }
      />

      <div className="dashboard-toolbar">
        <div className="segmented" role="group" aria-label="Form status">
          <button
            type="button"
            aria-pressed={!isArchived}
            className={!isArchived ? 'active' : ''}
            onClick={() => setActiveTab('active')}
          >
            <FileText aria-hidden="true" /> Active
          </button>
          <button
            type="button"
            aria-pressed={isArchived}
            className={isArchived ? 'active' : ''}
            onClick={() => setActiveTab('archived')}
          >
            <Archive aria-hidden="true" /> Archived
          </button>
        </div>

        <div className="input-with-icon dashboard-search">
          <Search aria-hidden="true" />
          <input
            type="search"
            className="input"
            placeholder="Search forms…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search forms"
          />
        </div>

        <div className="segmented view-toggle" role="group" aria-label="View mode">
          <button
            type="button"
            className={viewMode === 'card' ? 'active' : ''}
            onClick={() => setViewMode('card')}
            title="Grid view"
            aria-label="Grid view"
            aria-pressed={viewMode === 'card'}
          >
            <LayoutGrid aria-hidden="true" />
          </button>
          <button
            type="button"
            className={viewMode === 'list' ? 'active' : ''}
            onClick={() => setViewMode('list')}
            title="List view"
            aria-label="List view"
            aria-pressed={viewMode === 'list'}
          >
            <List aria-hidden="true" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className={`forms-grid ${viewMode === 'list' ? 'forms-list' : ''}`} aria-busy="true" aria-label="Loading forms">
          {Array.from({ length: viewMode === 'list' ? 5 : 6 }, (_, i) => (
            <div className="form-card form-card-skeleton" key={i}>
              <div className="skeleton skeleton-title" />
              <div className="skeleton skeleton-sub" />
              <div className="skeleton skeleton-line" />
            </div>
          ))}
        </div>
      ) : forms.length === 0 ? (
        searchTerm ? (
          <EmptyState
            bordered
            icon={SearchX}
            title="No matching forms"
            description={`Nothing matches “${searchTerm}”. Try a different search term.`}
          />
        ) : isArchived ? (
          <EmptyState
            bordered
            icon={Archive}
            title="No archived forms"
            description="Forms you archive are kept here, out of the way but not deleted."
          />
        ) : (
          <EmptyState
            bordered
            icon={FilePlus2}
            title="Create your first form"
            description="Build a form, share the link, and watch responses come in."
            action={
              <Link to="/forms/new" className="btn btn-primary">
                <Plus aria-hidden="true" /> Create Form
              </Link>
            }
          />
        )
      ) : (
        <div className={`forms-grid ${viewMode === 'list' ? 'forms-list' : ''}`}>
          {forms.map((form) => {
            const canEdit = form.is_owned || form.user_permissions.includes('edit')
            const menuOpen = openMenuId === form.id
            return (
              <article
                key={form.id}
                className={`form-card ${menuOpen ? 'menu-open' : ''}`}
                onClick={() => navigate(`/forms/${form.id}/preview`)}
              >
                <div className="form-card-head">
                  <div className="form-card-icon" aria-hidden="true">
                    <FileText />
                  </div>
                  <div className="form-card-heading">
                    <h3 className="form-card-title">
                      <Link to={`/forms/${form.id}/preview`} onClick={(e) => e.stopPropagation()}>
                        {form.title}
                      </Link>
                    </h3>
                    <div className="form-card-sub">
                      Updated {formatDate(form.updated_at)}
                      {!form.is_owned && (
                        <span className="badge" title={`Shared by ${form.owner_name}`}>
                          <UsersRound aria-hidden="true" /> Shared by {form.owner_name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {form.description && (
                  <p className="form-card-desc">{form.description}</p>
                )}

                <div className="form-card-meta">
                  <span title="Sections"><Layers aria-hidden="true" />{plural(form.section_count, 'section')}</span>
                  <span title="Questions"><ListChecks aria-hidden="true" />{plural(form.question_count, 'question')}</span>
                  <span title="Responses"><MessageSquare aria-hidden="true" />{plural(form.response_count, 'response')}</span>
                </div>

                <div className="form-card-actions" onClick={(e) => e.stopPropagation()}>
                  {canEdit && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => navigate(`/forms/${form.id}/edit`)}
                    >
                      <Pencil aria-hidden="true" /> Edit
                    </button>
                  )}
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => navigate(`/forms/${form.id}/responses`)}
                  >
                    <ChartColumn aria-hidden="true" /> Responses
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShareForm(form)}
                  >
                    <Share2 aria-hidden="true" /> Share
                  </button>

                  <div className="menu-anchor form-card-more">
                    <button
                      className="btn btn-ghost btn-sm btn-icon"
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpenMenuId(menuOpen ? null : form.id)
                      }}
                      aria-label={`More actions for ${form.title}`}
                      aria-haspopup="menu"
                      aria-expanded={menuOpen}
                    >
                      <Ellipsis aria-hidden="true" />
                    </button>

                    {menuOpen && (
                      <div className="dropdown-menu" role="menu" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="dropdown-item"
                          role="menuitem"
                          onClick={() => runMenuAction(() => navigate(`/forms/${form.id}/preview`))}
                        >
                          <Eye aria-hidden="true" /> Preview
                        </button>
                        {form.is_owned && (
                          <button
                            className="dropdown-item"
                            role="menuitem"
                            onClick={() => runMenuAction(() => setManagePermissionsId(form.id))}
                          >
                            <UsersRound aria-hidden="true" /> Manage access
                          </button>
                        )}
                        {form.is_archived ? (
                          <button
                            className="dropdown-item"
                            role="menuitem"
                            onClick={() => runMenuAction(() => handleRestore(form.id))}
                          >
                            <ArchiveRestore aria-hidden="true" /> Restore
                          </button>
                        ) : (
                          <button
                            className="dropdown-item"
                            role="menuitem"
                            onClick={() => runMenuAction(() => handleArchive(form.id))}
                          >
                            <Archive aria-hidden="true" /> Archive
                          </button>
                        )}
                        {form.is_owned && (
                          <>
                            <div className="dropdown-divider" />
                            <button
                              className="dropdown-item dropdown-item-danger"
                              role="menuitem"
                              onClick={() => runMenuAction(() => handleDelete(form))}
                            >
                              <Trash2 aria-hidden="true" /> Delete
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {!loading && hasMoreForms && (
        <div className="forms-lazy-loader inline-status" ref={lazyLoaderRef} aria-live="polite">
          <div className="spinner" /> Loading more forms…
        </div>
      )}

      {shareForm && <ShareModal form={shareForm} onClose={() => setShareForm(null)} />}

      {managePermissionsId && (
        <FormPermissions
          formId={managePermissionsId}
          onClose={() => setManagePermissionsId(null)}
        />
      )}

      {confirmDialog}
      <Toast toast={toast} />
    </div>
  )
}
