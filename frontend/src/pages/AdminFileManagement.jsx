import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
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
  })
  const [browserLoading, setBrowserLoading] = useState(true)
  const [deletingFilePath, setDeletingFilePath] = useState('')
  const [cleanupInfo, setCleanupInfo] = useState({ delete_count: 0, total_size_bytes: 0, files: [] })
  const [cleanupLoading, setCleanupLoading] = useState(true)
  const [cleanupRunning, setCleanupRunning] = useState(false)
  const [showCleanupFiles, setShowCleanupFiles] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    loadFileSummary()
    loadFileBrowser('')
    loadCleanupPreview(false)
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

  async function loadFileBrowser(path = '', silent = false) {
    if (!silent) setBrowserLoading(true)
    try {
      const { data } = await getFileManagerBrowser(path)
      setBrowser(data)
    } catch (err) {
      showToast('Failed to load files', 'error')
    } finally {
      if (!silent) setBrowserLoading(false)
    }
  }

  async function handleDeleteFile(path) {
    if (!window.confirm('Delete this file? This cannot be undone.')) return
    setDeletingFilePath(path)
    try {
      await deleteManagedFile(path)
      showToast('File deleted', 'success')
      await Promise.all([
        loadFileSummary(true),
        loadFileBrowser(browser.current_path || '', true),
      ])
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
    } catch (err) {
      showToast('Failed to load cleanup preview', 'error')
    } finally {
      setCleanupLoading(false)
    }
  }

  async function handleRunCleanup() {
    if (cleanupInfo.delete_count === 0) {
      showToast('No orphaned files to clean', 'success')
      return
    }

    if (!window.confirm(`Delete ${cleanupInfo.delete_count} orphaned file(s)? This cannot be undone.`)) return

    setCleanupRunning(true)
    try {
      const { data } = await runOrphanedCleanup()
      showToast(`Cleanup complete. Deleted ${data.deleted_count || 0} file(s).`, 'success')
      await Promise.all([
        loadCleanupPreview(false),
        loadFileSummary(true),
        loadFileBrowser(browser.current_path || '', true),
      ])
      setShowCleanupFiles(false)
    } catch (err) {
      showToast('Cleanup failed', 'error')
    } finally {
      setCleanupRunning(false)
    }
  }

  function showToast(message, type) {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
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

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Admin - File Management</h1>
        <button
          className="btn btn-secondary"
          onClick={() => {
            loadFileSummary()
            loadFileBrowser(browser.current_path || '')
          }}
          disabled={summaryLoading || browserLoading}
        >
          Refresh
        </button>
      </div>

      <div className="admin-view-switch">
        <Link to="/admin/users" className="btn btn-secondary">User Management</Link>
        <Link to="/admin/files" className="btn btn-primary">File Management</Link>
      </div>

      <div className="admin-file-metrics">
        <div className="form-card admin-metric-card">
          <div className="admin-metric-label">Storage Used</div>
          <div className="admin-metric-value">{summaryLoading ? 'Loading...' : formatBytes(summary?.total_storage_used_bytes)}</div>
        </div>
        <div className="form-card admin-metric-card">
          <div className="admin-metric-label">Space Left</div>
          <div className="admin-metric-value">{summaryLoading ? 'Loading...' : formatBytes(summary?.space_left_bytes)}</div>
        </div>
        <div className="form-card admin-metric-card">
          <div className="admin-metric-label">Total Files</div>
          <div className="admin-metric-value">{summaryLoading ? 'Loading...' : (summary?.total_files ?? 0)}</div>
        </div>
        <div className="form-card admin-metric-card">
          <div className="admin-metric-label">Disk Capacity</div>
          <div className="admin-metric-value">{summaryLoading ? 'Loading...' : formatBytes(summary?.total_disk_bytes)}</div>
        </div>
      </div>

      <div className="admin-file-grid">
        <div className="form-card" style={{ overflowX: 'auto' }}>
          <h3 style={{ marginBottom: '1rem' }}>Forms with Most Files</h3>
          <table className="admin-data-table">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '0.8rem' }}>Form</th>
                <th style={{ padding: '0.8rem' }}>Files</th>
              </tr>
            </thead>
            <tbody>
              {(summary?.forms_with_most_files || []).length === 0 && (
                <tr>
                  <td style={{ padding: '0.8rem' }} colSpan={2}>No form files found.</td>
                </tr>
              )}
              {(summary?.forms_with_most_files || []).map((form) => (
                <tr key={form.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.8rem' }}>{form.title}</td>
                  <td style={{ padding: '0.8rem' }}>{form.file_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="form-card" style={{ overflowX: 'auto' }}>
          <h3 style={{ marginBottom: '1rem' }}>File Types</h3>
          <table className="admin-data-table">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '0.8rem' }}>Type</th>
                <th style={{ padding: '0.8rem' }}>Count</th>
              </tr>
            </thead>
            <tbody>
              {(summary?.file_types || []).length === 0 && (
                <tr>
                  <td style={{ padding: '0.8rem' }} colSpan={2}>No files found.</td>
                </tr>
              )}
              {(summary?.file_types || []).map((fileType) => (
                <tr key={fileType.type} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.8rem' }}>{fileType.type}</td>
                  <td style={{ padding: '0.8rem' }}>{fileType.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="form-card" style={{ marginTop: '1rem', overflowX: 'auto' }}>
        <div className="admin-file-browser-header">
          <h3>Cleanup Orphaned Files (Uploads + QR Codes)</h3>
          <div className="admin-file-browser-controls">
            <button
              className="btn btn-secondary"
              onClick={() => loadCleanupPreview(false)}
              disabled={cleanupLoading || cleanupRunning}
            >
              Check Count
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => loadCleanupPreview(true)}
              disabled={cleanupLoading || cleanupRunning}
            >
              View Files
            </button>
            <button
              className="btn btn-danger"
              onClick={handleRunCleanup}
              disabled={cleanupLoading || cleanupRunning}
            >
              {cleanupRunning ? 'Cleaning...' : 'Cleanup'}
            </button>
          </div>
        </div>

        <p className="admin-current-path">
          {cleanupLoading
            ? 'Checking files...'
            : `Will delete ${cleanupInfo.delete_count} file(s) (${formatBytes(cleanupInfo.total_size_bytes)}).`}
        </p>

        {showCleanupFiles && !cleanupLoading && (
          <table className="admin-data-table">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '0.8rem' }}>Path</th>
                <th style={{ padding: '0.8rem' }}>Size</th>
                <th style={{ padding: '0.8rem' }}>Updated</th>
                <th style={{ padding: '0.8rem' }}>Open</th>
              </tr>
            </thead>
            <tbody>
              {cleanupInfo.files.length === 0 && (
                <tr>
                  <td style={{ padding: '0.8rem' }} colSpan={4}>No files to clean.</td>
                </tr>
              )}
              {cleanupInfo.files.map((file) => (
                <tr key={file.path} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.8rem' }}>{file.path}</td>
                  <td style={{ padding: '0.8rem' }}>{formatBytes(file.size_bytes)}</td>
                  <td style={{ padding: '0.8rem' }}>{formatDate(file.modified_at)}</td>
                  <td style={{ padding: '0.8rem' }}>
                    <a href={file.url} target="_blank" rel="noreferrer" className="btn btn-secondary">Open</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="form-card" style={{ marginTop: '1rem', overflowX: 'auto' }}>
        <div className="admin-file-browser-header">
          <h3>File Browser</h3>
          <div className="admin-file-browser-controls">
            <button
              className="btn btn-secondary"
              onClick={() => loadFileBrowser(browser.parent_path || '')}
              disabled={browserLoading || browser.parent_path === null}
            >
              Up
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => loadFileBrowser(browser.current_path || '')}
              disabled={browserLoading}
            >
              Refresh
            </button>
          </div>
        </div>

        <p className="admin-current-path">Current path: /{browser.current_path || ''}</p>

        <table className="admin-data-table">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '0.8rem' }}>Name</th>
              <th style={{ padding: '0.8rem' }}>Type</th>
              <th style={{ padding: '0.8rem' }}>Size</th>
              <th style={{ padding: '0.8rem' }}>Form</th>
              <th style={{ padding: '0.8rem' }}>Updated</th>
              <th style={{ padding: '0.8rem' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {browserLoading && (
              <tr>
                <td style={{ padding: '0.8rem' }} colSpan={6}>Loading files...</td>
              </tr>
            )}

            {!browserLoading && browser.directories.length === 0 && browser.files.length === 0 && (
              <tr>
                <td style={{ padding: '0.8rem' }} colSpan={6}>No files in this folder.</td>
              </tr>
            )}

            {!browserLoading && browser.directories.map((dir) => (
              <tr key={`dir-${dir.path}`} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '0.8rem' }}>{dir.name}</td>
                <td style={{ padding: '0.8rem' }}>Folder</td>
                <td style={{ padding: '0.8rem' }}>—</td>
                <td style={{ padding: '0.8rem' }}>—</td>
                <td style={{ padding: '0.8rem' }}>—</td>
                <td style={{ padding: '0.8rem' }}>
                  <button className="btn btn-secondary" onClick={() => loadFileBrowser(dir.path)}>
                    Open
                  </button>
                </td>
              </tr>
            ))}

            {!browserLoading && browser.files.map((file) => (
              <tr key={`file-${file.path}`} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '0.8rem' }}>{file.name}</td>
                <td style={{ padding: '0.8rem' }}>{file.extension}</td>
                <td style={{ padding: '0.8rem' }}>{formatBytes(file.size_bytes)}</td>
                <td style={{ padding: '0.8rem' }}>{file.form_title || '—'}</td>
                <td style={{ padding: '0.8rem' }}>{formatDate(file.modified_at)}</td>
                <td style={{ padding: '0.8rem' }}>
                  <div className="admin-file-actions">
                    <a href={file.url} target="_blank" rel="noreferrer" className="btn btn-secondary">Open</a>
                    <button
                      className="btn btn-danger"
                      onClick={() => handleDeleteFile(file.path)}
                      disabled={deletingFilePath === file.path}
                    >
                      {deletingFilePath === file.path ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </div>
  )
}
