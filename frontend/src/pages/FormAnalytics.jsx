import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getForm, getFormAnalytics, exportFormResponses } from '../api'
import ResponseSummary from '../components/ResponseSummary'

export default function FormAnalytics() {
  const { id } = useParams()
  const [form, setForm] = useState(null)
  const [summary, setSummary] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [trendMode, setTrendMode] = useState('daily')
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportFileName, setExportFileName] = useState('')
  const nextFilterIdRef = useRef(2)
  const [filters, setFilters] = useState(() => [createEmptyFilter(1)])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setSummary(null)
    setFilters([createEmptyFilter(1)])
    getForm(id).then(({ data }) => { if (!cancelled) setForm(data) })
      .catch(() => { if (!cancelled) setError('Failed to load form.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id])

  const questionEntries = useMemo(() => {
    if (!form) return []
    return form.sections.flatMap(section =>
      section.questions.map(question => ({ section, question }))
    )
  }, [form])

  const questionById = useMemo(() => {
    const byId = {}
    questionEntries.forEach(({ question }) => {
      byId[String(question.id)] = question
    })
    return byId
  }, [questionEntries])

  const activeFilters = useMemo(
    () => filters.filter(filter => isFilterActive(filter, questionById[String(filter.questionId)])),
    [filters, questionById]
  )

  const serializedFilters = JSON.stringify(activeFilters)
  useEffect(() => {
    if (!form || String(form.id) !== id) return
    let cancelled = false
    const controller = new AbortController()
    setRefreshing(true)
    setError(null)
    const timer = setTimeout(() => {
      getFormAnalytics(id, {
        filters: serializedFilters,
        trend: trendMode,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }, controller.signal)
        .then(({ data }) => { if (!cancelled) setSummary(data) })
        .catch(err => {
          if (!cancelled) setError(err.response?.data?.filters?.[0] || 'Failed to load analytics data.')
        })
        .finally(() => { if (!cancelled) setRefreshing(false) })
    }, 250)
    return () => { cancelled = true; clearTimeout(timer); controller.abort() }
  }, [id, form, serializedFilters, trendMode])

  const trendSeries = (summary?.trend || []).map(item => {
    const [year, month, day] = item.key.split('-').map(Number)
    const label = new Date(year, month - 1, day).toLocaleDateString()
    return { ...item, label: trendMode === 'weekly' ? `Week of ${label}` : label }
  })

  async function downloadFilteredCSV(requestedName) {
    const defaultName = `${sanitizeFilename(form?.title || 'form')}_filtered_analytics`
    const finalName = sanitizeFilename((requestedName || '').trim()) || defaultName
    setExporting(true)
    try {
      const { data } = await exportFormResponses(id, { filters: serializedFilters, section_titles: 'true' })
      const url = window.URL.createObjectURL(data)
      const link = document.createElement('a')
      link.href = url
      link.download = `${finalName}.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      setShowExportModal(false)
      setExportFileName('')
    } catch { setError('Failed to export CSV.') }
    finally { setExporting(false) }
  }

  function handleExportFilteredCSV() {
    if (!summary.count) return
    setExportFileName('')
    setShowExportModal(true)
  }

  function handleExportModalSubmit(event) {
    event.preventDefault()
    downloadFilteredCSV(exportFileName)
  }

  function updateFilter(filterId, updates) {
    setFilters(current =>
      current.map(filter => filter.id === filterId ? { ...filter, ...updates } : filter)
    )
  }

  function handleFilterQuestionChange(filterId, questionId) {
    updateFilter(filterId, {
      questionId,
      choiceId: '',
      textQuery: '',
      mediaMode: '',
      numericOperator: '=',
      numericValue: ''
    })
  }

  function addFilter() {
    const nextId = nextFilterIdRef.current
    nextFilterIdRef.current += 1
    setFilters(current => [...current, createEmptyFilter(nextId)])
  }

  function removeFilter(filterId) {
    setFilters(current => {
      if (current.length === 1) {
        return [createEmptyFilter(current[0].id)]
      }
      return current.filter(filter => filter.id !== filterId)
    })
  }

  function clearFilter() {
    setFilters([createEmptyFilter(1)])
    nextFilterIdRef.current = 2
  }

  if (loading) return <div className="loading"><div className="spinner" /></div>
  if (!form || !summary) return error ? <div role="alert">{error}</div> : <div className="loading"><div className="spinner" /></div>

  return (
    <div className="dashboard analytics-page">
      <div className="dashboard-header">
        <div>
          <h1>Analytics: {form.title}</h1>
          <span className="form-count">
            {summary.count} response{summary.count !== 1 ? 's' : ''}
            {activeFilters.length ? ` (filtered from ${summary.total_count})` : ' total'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-primary" onClick={handleExportFilteredCSV} disabled={!summary.count || refreshing || exporting || !!error}>
            ⬇ Export Filtered CSV
          </button>
          <Link to={`/forms/${id}/responses`} className="btn btn-secondary">
            ← Back to Responses
          </Link>
          <Link to={`/forms/${id}/edit`} className="btn btn-secondary">
            Edit Form
          </Link>
        </div>
      </div>

      {error && <p role="alert">{error}</p>}
      {refreshing && <p role="status">Updating analytics…</p>}
      <div className="analytics-kpis" aria-busy={refreshing}>
        <KpiCard title="Total Responses" value={summary.count} />
        <KpiCard title="Questions" value={questionEntries.length} />
        <KpiCard title="Sections" value={form.sections.length} />
      </div>

      <div className="summary-card">
        <div className="analytics-card-header">
          <h2>Filter Responses by Answers</h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-secondary" onClick={addFilter} disabled={filters.length >= 20}>
              + Add Filter
            </button>
            {activeFilters.length > 0 && (
              <button className="btn btn-secondary" onClick={clearFilter}>
                Clear Filters
              </button>
            )}
          </div>
        </div>

        <div className="analytics-filter-list">
          {filters.map((filter, index) => {
            const selectedFilterQuestion = questionById[String(filter.questionId)] || null

            return (
              <div key={filter.id} className="analytics-filter-row">
                <div className="analytics-filter-field">
                  <label>Question {index + 1}</label>
                  <select
                    value={filter.questionId}
                    onChange={(event) => handleFilterQuestionChange(filter.id, event.target.value)}
                  >
                    <option value="">Select question</option>
                    {questionEntries.map(({ section, question }) => (
                      <option key={question.id} value={question.id}>
                        {form.sections.length > 1 ? `${section.title} · ` : ''}{question.text}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedFilterQuestion && (selectedFilterQuestion.question_type === 'multiple_choice' || selectedFilterQuestion.question_type === 'multiple_select') && (
                  <div className="analytics-filter-field">
                    <label>Answer Option</label>
                    <select
                      value={filter.choiceId}
                      onChange={(event) => updateFilter(filter.id, { choiceId: event.target.value })}
                    >
                      <option value="">Any option</option>
                      {selectedFilterQuestion.choices.map(choice => (
                        <option key={choice.id} value={choice.id}>{choice.text}</option>
                      ))}
                    </select>
                  </div>
                )}

                {selectedFilterQuestion && selectedFilterQuestion.question_type === 'media' && (
                  <div className="analytics-filter-field">
                    <label>Upload Status</label>
                    <select
                      value={filter.mediaMode}
                      onChange={(event) => updateFilter(filter.id, { mediaMode: event.target.value })}
                    >
                      <option value="">Any</option>
                      <option value="with_file">Has uploaded file</option>
                      <option value="without_file">No uploaded file</option>
                    </select>
                  </div>
                )}

                {selectedFilterQuestion && (selectedFilterQuestion.question_type === 'number' || selectedFilterQuestion.question_type === 'float') && (
                  <>
                    <div className="analytics-filter-field">
                      <label>Operator</label>
                      <select
                        value={filter.numericOperator}
                        onChange={(event) => updateFilter(filter.id, { numericOperator: event.target.value })}
                      >
                        <option value="=">= (equals)</option>
                        <option value="!=">!= (not equal)</option>
                        <option value=">">&gt; (greater than)</option>
                        <option value=">=">&gt;= (at least)</option>
                        <option value="<">&lt; (less than)</option>
                        <option value="<=">&lt;= (at most)</option>
                      </select>
                    </div>
                    <div className="analytics-filter-field">
                      <label>Value</label>
                      <input
                        type="number"
                        step={selectedFilterQuestion.question_type === 'float' ? 'any' : '1'}
                        value={filter.numericValue}
                        placeholder="Enter number"
                        onChange={(event) => updateFilter(filter.id, { numericValue: event.target.value })}
                      />
                    </div>
                  </>
                )}

                {selectedFilterQuestion && selectedFilterQuestion.question_type !== 'multiple_choice' && selectedFilterQuestion.question_type !== 'multiple_select' && selectedFilterQuestion.question_type !== 'media' && selectedFilterQuestion.question_type !== 'number' && selectedFilterQuestion.question_type !== 'float' && (
                  <div className="analytics-filter-field">
                    <label>Text Contains</label>
                    <input
                      type="text"
                      value={filter.textQuery}
                      placeholder="Type keyword or phrase"
                      onChange={(event) => updateFilter(filter.id, { textQuery: event.target.value })}
                    />
                  </div>
                )}

                <div className="analytics-filter-actions">
                  <button
                    className="btn btn-secondary"
                    onClick={() => removeFilter(filter.id)}
                    disabled={filters.length === 1}
                  >
                    Remove
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <div className="analytics-footnote" style={{ marginTop: '10px' }}>
          {activeFilters.length > 0
            ? `${activeFilters.length} active filter${activeFilters.length !== 1 ? 's' : ''} (AND logic)`
            : 'Select question-specific criteria to filter responses.'}
        </div>
      </div>

      <div className="summary-card">
        <div className="analytics-card-header">
          <h2>Response Trends</h2>
          <div className="tabs" style={{ marginBottom: 0, borderBottom: 'none', gap: '12px' }}>
            <button
              className={`tab-btn ${trendMode === 'daily' ? 'active' : ''}`}
              onClick={() => setTrendMode('daily')}
            >
              Daily
            </button>
            <button
              className={`tab-btn ${trendMode === 'weekly' ? 'active' : ''}`}
              onClick={() => setTrendMode('weekly')}
            >
              Weekly
            </button>
          </div>
        </div>
        <TrendChart series={trendSeries} />
      </div>

      <ResponseSummary form={form} summary={summary} showKeywords />

      {showExportModal && (
        <div className="confirm-overlay" onClick={() => setShowExportModal(false)}>
          <div className="confirm-dialog analytics-export-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Export Filtered CSV</h3>
            <p>Enter a file name, or leave it blank to use the default.</p>

            <form className="analytics-export-form" onSubmit={handleExportModalSubmit}>
              <div className="analytics-export-field">
                <label htmlFor="analyticsExportFilename">File name (optional)</label>
                <input
                  id="analyticsExportFilename"
                  type="text"
                  value={exportFileName}
                  placeholder="Leave blank to use default"
                  onChange={(event) => setExportFileName(event.target.value)}
                  autoFocus
                />
              </div>

              <div className="confirm-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowExportModal(false)}>
                  Cancel
                </button>
                <button type="button" className="btn btn-secondary" disabled={exporting || refreshing} onClick={() => downloadFilteredCSV('')}>
                  Leave Blank
                </button>
                <button type="submit" className="btn btn-primary" disabled={exporting || refreshing}>
                  Export CSV
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function createEmptyFilter(id) {
  return {
    id,
    questionId: '',
    choiceId: '',
    textQuery: '',
    mediaMode: '',
    numericOperator: '=',
    numericValue: ''
  }
}

function isFilterActive(filter, question) {
  if (!question || !filter.questionId) return false

  if (question.question_type === 'multiple_choice' || question.question_type === 'multiple_select') {
    return Boolean(filter.choiceId)
  }

  if (question.question_type === 'media') {
    return Boolean(filter.mediaMode)
  }

  if (question.question_type === 'number' || question.question_type === 'float') {
    return (filter.numericValue || '').trim().length > 0
  }

  return (filter.textQuery || '').trim().length > 0
}

function KpiCard({ title, value }) {
  return (
    <div className="summary-card analytics-kpi-card">
      <div className="analytics-kpi-title">{title}</div>
      <div className="analytics-kpi-value">{value}</div>
    </div>
  )
}

function TrendChart({ series }) {
  if (!series.length) {
    return (
      <div className="empty-state" style={{ padding: '24px 12px' }}>
        <p>No responses available for trend analysis.</p>
      </div>
    )
  }

  const maxCount = Math.max(...series.map(item => item.count), 1)

  return (
    <div>
      {series.map(item => {
        const widthPercent = Math.round((item.count / maxCount) * 100)

        return (
          <div key={item.key} className="chart-row">
            <div className="chart-label" title={item.label}>{item.label}</div>
            <div className="chart-bar-container">
              <div className="chart-bar-fill" style={{ width: `${widthPercent}%` }} />
            </div>
            <div className="chart-count">{item.count}</div>
          </div>
        )
      })}
    </div>
  )
}

function sanitizeFilename(value) {
  return String(value || '')
    .replace(/[\\/:*?"<>|]/g, '')
    .trim()
}
