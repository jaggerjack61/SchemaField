import { useState, useEffect } from 'react'
import {
  ArrowUpLeft,
  Database,
  ExternalLink,
  Eye,
  File,
  Files,
  Folder,
  HardDrive,
  RefreshCw,
  ScanSearch,
  Server,
  Trash2,
} from 'lucide-react'
import ImagePreviewModal, { isImageUrl } from '../components/ImagePreviewModal'
import Pagination from '../components/Pagination'
import PageHeader from '../components/PageHeader'
import AdminNav from '../components/AdminNav'
import Toast, { useToast } from '../components/Toast'
import { useConfirm } from '../components/ConfirmDialog'
import {
  getFileManagerSummary,
  getFileManagerBrowser,
  deleteManagedFile,
  getCleanupPreview,
  runOrphanedCleanup,
} from '../api'

export default function AdminFileManagement() {
  const [summary, setSummary] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [browser, setBrowser] = useState({
    current_path: '',
    parent_path: null,
    directories: [],
    files: [],
    page: 1,
    page_size: 50,
    total_entries: 0,
  })
  const [browserLoading, setBrowserLoading] = useState(true)
  const [deletingFilePath, setDeletingFilePath] = useState('')
  // null until an orphan scan has run. The scan walks every managed file, so
  // it only runs when asked for rather than on every visit.
  const [cleanupInfo, setCleanupInfo] = useState(null)
  const [cleanupLoading, setCleanupLoading] = useState(false)
  const [cleanupRunning, setCleanupRunning] = useState(false)
  const [showCleanupFiles, setShowCleanupFiles] = useState(false)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [toast, showToast] = useToast()
  const [confirm, confirmDialog] = useConfirm()

  useEffect(() => {
    loadFileSummary()
    loadFileBrowser('')
  }, [])

  async function loadFileSummary(silent = false) {
    if (!silent) setSummaryLoading(true)
    try {
      const { data } = await getFileManagerSummary()
      setSummary(data)
    } catch (err) {
      showToast('Failed to load file manager summary', 'error')
    } finally {
      if (!silent) setSummaryLoading(false)
    }
  }

  async function loadFileBrowser(path = '', silent = false, page = 1) {
    if (!silent) setBrowserLoading(true)
    try {
      let { data } = await getFileManagerBrowser(path, page)
      const lastPage = Math.max(1, Math.ceil(data.total_entries / data.page_size))
      if (page > lastPage) ({ data } = await getFileManagerBrowser(path, lastPage))
      setBrowser(data)
    } catch (err) {
      showToast('Failed to load files', 'error')
    } finally {
      if (!silent) setBrowserLoading(false)
    }
  }

  // Adjust the totals for one deleted file instead of rescanning all media.
  function removeFromSummary(file) {
    setSummary(current => current && {
      ...current,
      total_files: Math.max(0, current.total_files - 1),
      total_storage_used_bytes: Math.max(0, current.total_storage_used_bytes - file.size_bytes),
      space_left_bytes: current.space_left_bytes == null ? null : current.space_left_bytes + file.size_bytes,
      file_types: current.file_types
        .map(type => (type.type === file.extension ? { ...type, count: type.count - 1 } : type))
        .filter(type => type.count > 0),
      forms_with_most_files: file.form_id && file.path.startsWith('uploads/')
        ? current.forms_with_most_files
          .map(form => (form.id === file.form_id ? { ...form, file_count: form.file_count - 1 } : form))
          .filter(form => form.file_count > 0)
        : current.forms_with_most_files,
    })
  }

  async function handleDeleteFile(file) {
    const confirmed = await confirm({
      title: 'Delete file?',
      message: `“${file.name}” will be permanently deleted. This can’t be undone.`,
      confirmLabel: 'Delete file',
      tone: 'danger',
    })
    if (!confirmed) return
    setDeletingFilePath(file.path)
    try {
      await deleteManagedFile(file.path)
      showToast('File deleted', 'success')
      removeFromSummary(file)
      await loadFileBrowser(browser.current_path || '', true, browser.page)
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to delete file', 'error')
    } finally {
      setDeletingFilePath('')
    }
  }

  async function loadCleanupPreview(viewFiles = false) {
    setCleanupLoading(true)
    try {
      const { data } = await getCleanupPreview(viewFiles)
      setCleanupInfo({
        delete_count: data.delete_count || 0,
        total_size_bytes: data.total_size_bytes || 0,
        files: data.files || [],
      })
      setShowCleanupFiles(viewFiles)
      return data
    } catch (err) {
      showToast('Failed to load cleanup preview', 'error')
      return null
    } finally {
      setCleanupLoading(false)
    }
  }

  async function handleRunCleanup() {
    const preview = cleanupInfo ?? await loadCleanupPreview(false)
    if (!preview) return
    if (!preview.delete_count) {
      showToast('No orphaned files to clean', 'success')
      return
    }

    const confirmed = await confirm({
      title: 'Clean up orphaned files?',
      message: `${preview.delete_count} file${preview.delete_count !== 1 ? 's' : ''} that no form or response uses will be permanently deleted. This can’t be undone.`,
      confirmLabel: 'Delete files',
      tone: 'danger',
    })
    if (!confirmed) return

    setCleanupRunning(true)
    try {
      const { data } = await runOrphanedCleanup()
      showToast(`Cleanup complete. Deleted ${data.deleted_count || 0} file(s).`, 'success')
      await Promise.all([
        loadCleanupPreview(false),
        loadFileSummary(true),
        loadFileBrowser(browser.current_path || '', true, browser.page),
      ])
      setShowCleanupFiles(false)
    } catch (err) {
      showToast('Cleanup failed', 'error')
    } finally {
      setCleanupRunning(false)
    }
  }

  function openPreview(url) {
    if (!url) return
    setPreviewUrl(url)
  }

  function closePreview() {
    setPreviewUrl(null)
  }

  function formatBytes(bytes) {
    if (bytes === null || bytes === undefined) return 'N/A'
    if (bytes === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
    const value = bytes / Math.pow(1024, i)
    return `${value.toFixed(i === 0 ? 0 : 2)} ${units[i]}`
  }

  function formatDate(dateString) {
    if (!dateString) return '—'
    return new Date(dateString).toLocaleString()
  }

  const usedPercent = summary?.total_disk_bytes
    ? Math.min(100, Math.round((summary.total_storage_used_bytes / summary.total_disk_bytes) * 100))
    : null

  function metric(value) {
    return summaryLoading ? <span className="skeleton admin-metric-skeleton" /> : value
  }

  function renderOpenAction(file) {
    return isImageUrl(file.url) ? (
      <button className="btn btn-ghost btn-sm" onClick={() => openPreview(file.url)}>
        <Eye aria-hidden="true" /> View
      </button>
    ) : (
      <a href={file.url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
        <ExternalLink aria-hidden="true" /> Open
      </a>
    )
  }

  const pathParts = (browser.current_path || '').split('/').filter(Boolean)

  return (
    <div className="admin-page">
      <PageHeader
        title="Admin"
        subtitle="Manage user accounts and stored files."
        actions={
          <button
            className="btn btn-secondary"
            onClick={() => {
              loadFileSummary()
              loadFileBrowser(browser.current_path || '', false, browser.page)
            }}
            disabled={summaryLoading || browserLoading}
          >
            <RefreshCw aria-hidden="true" /> Refresh
          </button>
        }
      />
      <AdminNav />

      <div className="stat-grid admin-metrics">
        <div className="card stat-card">
          <div className="stat-card-top">
            <span>Storage used</span>
            <span className="stat-card-icon"><Database aria-hidden="true" /></span>
          </div>
          <div className="stat-card-value">{metric(formatBytes(summary?.total_storage_used_bytes))}</div>
          {!summaryLoading && usedPercent !== null && (
            <div className="admin-meter" title={`${usedPercent}% of disk capacity`}>
              <div className="admin-meter-fill" style={{ width: `${Math.max(usedPercent, 1)}%` }} />
            </div>
          )}
        </div>
        <div className="card stat-card">
          <div className="stat-card-top">
            <span>Space left</span>
            <span className="stat-card-icon"><HardDrive aria-hidden="true" /></span>
          </div>
          <div className="stat-card-value">{metric(formatBytes(summary?.space_left_bytes))}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-card-top">
            <span>Total files</span>
            <span className="stat-card-icon"><Files aria-hidden="true" /></span>
          </div>
          <div className="stat-card-value">{metric((summary?.total_files ?? 0).toLocaleString())}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-card-top">
            <span>Disk capacity</span>
            <span className="stat-card-icon"><Server aria-hidden="true" /></span>
          </div>
          <div className="stat-card-value">{metric(formatBytes(summary?.total_disk_bytes))}</div>
        </div>
      </div>

      <div className="admin-file-grid">
        <div className="card">
          <div className="card-header"><h2 className="card-title">Forms with most files</h2></div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Form</th>
                  <th className="cell-num">Files</th>
                </tr>
              </thead>
              <tbody>
                {(summary?.forms_with_most_files || []).length === 0 && (
                  <tr>
                    <td colSpan={2} className="table-message">No form files found.</td>
                  </tr>
                )}
                {(summary?.forms_with_most_files || []).map((form) => (
                  <tr key={form.id}>
                    <td>{form.title}</td>
                    <td className="cell-num">{form.file_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h2 className="card-title">File types</h2></div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th className="cell-num">Count</th>
                </tr>
              </thead>
              <tbody>
                {(summary?.file_types || []).length === 0 && (
                  <tr>
                    <td colSpan={2} className="table-message">No files found.</td>
                  </tr>
                )}
                {(summary?.file_types || []).map((fileType) => (
                  <tr key={fileType.type}>
                    <td><span className="badge admin-ext">{fileType.type}</span></td>
                    <td className="cell-num">{fileType.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Orphaned files</h2>
            <p className="card-description">Uploads and QR codes that no form or response references any more.</p>
          </div>
          <div className="page-actions">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => loadCleanupPreview(false)}
              disabled={cleanupLoading || cleanupRunning}
            >
              <ScanSearch aria-hidden="true" /> Scan
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => loadCleanupPreview(true)}
              disabled={cleanupLoading || cleanupRunning}
            >
              <Eye aria-hidden="true" /> View Files
            </button>
            <button
              className="btn btn-danger btn-sm"
              onClick={handleRunCleanup}
              disabled={cleanupLoading || cleanupRunning}
            >
              <Trash2 aria-hidden="true" /> {cleanupRunning ? 'Cleaning…' : 'Clean Up'}
            </button>
          </div>
        </div>

        <div className="card-body admin-cleanup-status">
          {cleanupLoading ? (
            <span className="inline-status"><span className="spinner" /> Scanning files…</span>
          ) : cleanupInfo ? (
            <span>
              <strong>{cleanupInfo.delete_count}</strong> orphaned file{cleanupInfo.delete_count !== 1 ? 's' : ''}
              {' '}using <strong>{formatBytes(cleanupInfo.total_size_bytes)}</strong>.
            </span>
          ) : (
            <span className="text-muted">Not scanned yet. Scanning checks every stored file, so it only runs when you ask.</span>
          )}
        </div>

        {showCleanupFiles && !cleanupLoading && cleanupInfo && (
          <div className="table-wrap admin-cleanup-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Path</th>
                  <th className="cell-num">Size</th>
                  <th>Updated</th>
                  <th className="cell-actions"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {cleanupInfo.files.length === 0 && (
                  <tr>
                    <td colSpan={4} className="table-message">No files to clean.</td>
                  </tr>
                )}
                {cleanupInfo.files.map((file) => (
                  <tr key={file.path}>
                    <td className="admin-path-cell">{file.path}</td>
                    <td className="cell-num">{formatBytes(file.size_bytes)}</td>
                    <td className="cell-muted">{formatDate(file.modified_at)}</td>
                    <td className="cell-actions">{renderOpenAction(file)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <div className="admin-breadcrumb" aria-label="Current folder">
            <button className="link-button" onClick={() => loadFileBrowser('')} disabled={browserLoading || !pathParts.length}>
              media
            </button>
            {pathParts.map((part, i) => (
              <span key={i} className="admin-breadcrumb-part">
                <span aria-hidden="true">/</span>
                {i === pathParts.length - 1 ? (
                  <span className="admin-breadcrumb-current">{part}</span>
                ) : (
                  <button
                    className="link-button"
                    onClick={() => loadFileBrowser(pathParts.slice(0, i + 1).join('/'))}
                    disabled={browserLoading}
                  >
                    {part}
                  </button>
                )}
              </span>
            ))}
          </div>
          <div className="page-actions">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => loadFileBrowser(browser.parent_path || '')}
              disabled={browserLoading || browser.parent_path === null}
            >
              <ArrowUpLeft aria-hidden="true" /> Up
            </button>
            <button
              className="btn btn-secondary btn-sm btn-icon"
              onClick={() => loadFileBrowser(browser.current_path || '', false, browser.page)}
              disabled={browserLoading}
              aria-label="Refresh folder"
              title="Refresh folder"
            >
              <RefreshCw aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th className="cell-num">Size</th>
                <th>Form</th>
                <th>Updated</th>
                <th className="cell-actions"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {browserLoading && (
                <tr>
                  <td colSpan={5} className="table-message">
                    <span className="inline-status"><span className="spinner" /> Loading files…</span>
                  </td>
                </tr>
              )}

              {!browserLoading && browser.directories.length === 0 && browser.files.length === 0 && (
                <tr>
                  <td colSpan={5} className="table-message">This folder is empty.</td>
                </tr>
              )}

              {!browserLoading && browser.directories.map((dir) => (
                <tr key={`dir-${dir.path}`}>
                  <td>
                    <button className="file-name file-name-folder" onClick={() => loadFileBrowser(dir.path)}>
                      <Folder aria-hidden="true" />
                      <span>{dir.name}</span>
                    </button>
                  </td>
                  <td className="cell-num cell-muted">—</td>
                  <td className="cell-muted">—</td>
                  <td className="cell-muted">—</td>
                  <td className="cell-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => loadFileBrowser(dir.path)}>
                      Open
                    </button>
                  </td>
                </tr>
              ))}

              {!browserLoading && browser.files.map((file) => (
                <tr key={`file-${file.path}`}>
                  <td>
                    <div className="file-name">
                      <File aria-hidden="true" />
                      <span>{file.name}</span>
                    </div>
                  </td>
                  <td className="cell-num">{formatBytes(file.size_bytes)}</td>
                  <td className={file.form_title ? '' : 'cell-muted'}>{file.form_title || '—'}</td>
                  <td className="cell-muted">{formatDate(file.modified_at)}</td>
                  <td className="cell-actions">
                    <div className="row-actions">
                      {renderOpenAction(file)}
                      <button
                        className="btn btn-ghost-danger btn-sm btn-icon"
                        onClick={() => handleDeleteFile(file)}
                        disabled={deletingFilePath === file.path}
                        aria-label={`Delete ${file.name}`}
                        title="Delete file"
                      >
                        <Trash2 aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="admin-browser-footer">
          <Pagination page={browser.page} pageSize={browser.page_size} count={browser.total_entries}
            disabled={browserLoading} onPage={page => loadFileBrowser(browser.current_path, false, page)} />
        </div>
      </div>

      <ImagePreviewModal url={previewUrl} isOpen={Boolean(previewUrl)} onClose={closePreview} />
      {confirmDialog}
      <Toast toast={toast} />
    </div>
  )
}
