import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { CircleAlert, Download, Filter, Layers, ListChecks, MessageSquare, Pencil, Plus, TrendingUp, X } from 'lucide-react'
import { getForm, getFormAnalytics, exportFormResponses } from '../api'
import ResponseSummary from '../components/ResponseSummary'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import Modal from '../components/Modal'

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
        keywords: 1,
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
  if (!form || !summary) {
    return error
      ? <div className="alert alert-danger" role="alert"><CircleAlert aria-hidden="true" />{error}</div>
      : <div className="loading"><div className="spinner" /></div>
  }

  return (
    <div className="analytics-page">
      <PageHeader
        back={{ to: `/forms/${id}/responses`, label: 'Responses' }}
        title={form.title}
        subtitle={
          <>
            {summary.count} response{summary.count !== 1 ? 's' : ''}
            {activeFilters.length ? ` (filtered from ${summary.total_count})` : ' total'}
          </>
        }
        actions={
          <>
            {refreshing && (
              <span className="inline-status" role="status"><span className="spinner" /> Updating…</span>
            )}
            <Link to={`/forms/${id}/edit`} className="btn btn-ghost">
              <Pencil aria-hidden="true" /> Edit form
            </Link>
            <button className="btn btn-primary" onClick={handleExportFilteredCSV} disabled={!summary.count || refreshing || exporting || !!error}>
              <Download aria-hidden="true" /> {activeFilters.length ? 'Export filtered CSV' : 'Export CSV'}
            </button>
          </>
        }
      />

      {error && (
        <div className="alert alert-danger" role="alert">
          <CircleAlert aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <div className="stat-grid" aria-busy={refreshing}>
        <KpiCard icon={MessageSquare} title={activeFilters.length ? 'Matching responses' : 'Total responses'} value={summary.count} />
        <KpiCard icon={ListChecks} title="Questions" value={questionEntries.length} />
        <KpiCard icon={Layers} title="Sections" value={form.sections.length} />
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Filters</h2>
            <p className="card-description">
              {activeFilters.length > 0
                ? `${activeFilters.length} active filter${activeFilters.length !== 1 ? 's' : ''}. AND requires both conditions; OR allows either. AND groups are evaluated first.`
                : 'Narrow the analysis to responses with specific answers.'}
            </p>
          </div>
          {activeFilters.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={clearFilter}>
              Clear all
            </button>
          )}
        </div>

        <div className="card-body analytics-filter-list">
          {filters.map((filter, index) => {
            const selectedFilterQuestion = questionById[String(filter.questionId)] || null
            const type = selectedFilterQuestion?.question_type
            const fieldId = `filter-${filter.id}`

            return (
              <div key={filter.id} className="analytics-filter-row">
                {index === 0 ? (
                  <span className="analytics-filter-index" aria-hidden="true"><Filter size={14} /></span>
                ) : (
                  <select
                    className="select analytics-filter-index analytics-filter-conjunction"
                    aria-label={`Filter ${index + 1} connection`}
                    value={filter.conjunction}
                    onChange={event => updateFilter(filter.id, { conjunction: event.target.value })}
                  >
                    <option value="and">AND</option>
                    <option value="or">OR</option>
                  </select>
                )}
                <div className="analytics-filter-fields">
                  <div className="field analytics-filter-question">
                    <label className="sr-only" htmlFor={`${fieldId}-question`}>Question {index + 1}</label>
                    <select
                      id={`${fieldId}-question`}
                      className="select"
                      value={filter.questionId}
                      onChange={(event) => handleFilterQuestionChange(filter.id, event.target.value)}
                    >
                      <option value="">Select a question…</option>
                      {questionEntries.map(({ section, question }) => (
                        <option key={question.id} value={question.id}>
                          {form.sections.length > 1 ? `${section.title} · ` : ''}{question.text}
                        </option>
                      ))}
                    </select>
                  </div>

                  {(type === 'multiple_choice' || type === 'multiple_select') && (
                    <div className="field">
                      <label className="sr-only" htmlFor={`${fieldId}-choice`}>Answer option</label>
                      <select
                        id={`${fieldId}-choice`}
                        className="select"
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

                  {type === 'media' && (
                    <div className="field">
                      <label className="sr-only" htmlFor={`${fieldId}-media`}>Upload status</label>
                      <select
                        id={`${fieldId}-media`}
                        className="select"
                        value={filter.mediaMode}
                        onChange={(event) => updateFilter(filter.id, { mediaMode: event.target.value })}
                      >
                        <option value="">Any upload status</option>
                        <option value="with_file">Has uploaded file</option>
                        <option value="without_file">No uploaded file</option>
                      </select>
                    </div>
                  )}

                  {(type === 'number' || type === 'float') && (
                    <div className="analytics-filter-numeric">
                      <label className="sr-only" htmlFor={`${fieldId}-op`}>Operator</label>
                      <select
                        id={`${fieldId}-op`}
                        className="select analytics-operator"
                        value={filter.numericOperator}
                        onChange={(event) => updateFilter(filter.id, { numericOperator: event.target.value })}
                      >
                        <option value="=">equals</option>
                        <option value="!=">does not equal</option>
                        <option value=">">greater than</option>
                        <option value=">=">at least</option>
                        <option value="<">less than</option>
                        <option value="<=">at most</option>
                      </select>
                      <label className="sr-only" htmlFor={`${fieldId}-value`}>Value</label>
                      <input
                        id={`${fieldId}-value`}
                        className="input"
                        type="number"
                        step={type === 'float' ? 'any' : '1'}
                        value={filter.numericValue}
                        placeholder="Value"
                        onChange={(event) => updateFilter(filter.id, { numericValue: event.target.value })}
                      />
                    </div>
                  )}

                  {selectedFilterQuestion && (type === 'short_text' || type === 'long_text') && (
                    <div className="field">
                      <label className="sr-only" htmlFor={`${fieldId}-text`}>Text contains</label>
                      <input
                        id={`${fieldId}-text`}
                        className="input"
                        type="text"
                        value={filter.textQuery}
                        placeholder="Type keyword or phrase"
                        onChange={(event) => updateFilter(filter.id, { textQuery: event.target.value })}
                      />
                    </div>
                  )}
                </div>

                <button
                  className="btn btn-ghost btn-sm btn-icon"
                  onClick={() => removeFilter(filter.id)}
                  disabled={filters.length === 1 && !filter.questionId}
                  aria-label={`Remove filter ${index + 1}`}
                  title="Remove filter"
                >
                  <X aria-hidden="true" />
                </button>
              </div>
            )
          })}

          <button className="btn btn-ghost btn-sm analytics-add-filter" onClick={addFilter} disabled={filters.length >= 20}>
            <Plus aria-hidden="true" /> Add filter
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Responses over time</h2>
            <p className="card-description">
              {trendMode === 'weekly' ? 'Responses per week' : 'Responses per day'}
              {activeFilters.length ? ', matching the filters above' : ''}
            </p>
          </div>
          <div className="segmented" role="group" aria-label="Trend interval">
            <button
              className={trendMode === 'daily' ? 'active' : ''}
              aria-pressed={trendMode === 'daily'}
              onClick={() => setTrendMode('daily')}
            >
              Daily
            </button>
            <button
              className={trendMode === 'weekly' ? 'active' : ''}
              aria-pressed={trendMode === 'weekly'}
              onClick={() => setTrendMode('weekly')}
            >
              Weekly
            </button>
          </div>
        </div>
        <div className="card-body">
          <TrendChart series={trendSeries} />
        </div>
      </div>

      <ResponseSummary form={form} summary={summary} showKeywords />

      {showExportModal && (
        <Modal
          title={activeFilters.length ? 'Export filtered CSV' : 'Export CSV'}
          description={activeFilters.length
            ? `Downloads the ${summary.count} response${summary.count !== 1 ? 's' : ''} that match your filters.`
            : `Downloads all ${summary.count} response${summary.count !== 1 ? 's' : ''}.`}
          icon={<Download />}
          onClose={() => setShowExportModal(false)}
          onSubmit={handleExportModalSubmit}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setShowExportModal(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={exporting || refreshing}>
                {exporting ? 'Exporting…' : 'Export CSV'}
              </button>
            </>
          }
        >
          <div className="field">
            <label className="field-label" htmlFor="analyticsExportFilename">File name</label>
            <input
              id="analyticsExportFilename"
              className="input"
              type="text"
              value={exportFileName}
              placeholder={`${sanitizeFilename(form.title || 'form')}_filtered_analytics`}
              onChange={(event) => setExportFileName(event.target.value)}
              autoFocus
            />
            <span className="field-hint">Optional. Leave blank to use the default name; “.csv” is added for you.</span>
          </div>
        </Modal>
      )}
    </div>
  )
}

function createEmptyFilter(id) {
  return {
    id,
    conjunction: 'and',
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

function KpiCard({ icon: Icon, title, value }) {
  return (
    <div className="card stat-card">
      <div className="stat-card-top">
        <span>{title}</span>
        <span className="stat-card-icon"><Icon aria-hidden="true" /></span>
      </div>
      <div className="stat-card-value">{value.toLocaleString()}</div>
    </div>
  )
}

// Round the axis maximum up to a clean 1/2/5 step so gridlines land on tidy numbers.
function niceTicks(max) {
  if (max <= 4) return Array.from({ length: Math.max(max, 1) + 1 }, (_, i) => i)
  const rough = max / 4
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 5, 10].map(m => m * magnitude).find(candidate => candidate >= rough)
  const top = Math.ceil(max / step) * step
  return Array.from({ length: top / step + 1 }, (_, i) => i * step)
}

function TrendChart({ series }) {
  const [hovered, setHovered] = useState(null)

  if (!series.length) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="No trend data yet"
        description="Once responses arrive, their timing will appear here."
      />
    )
  }

  const ticks = niceTicks(Math.max(...series.map(item => item.count)))
  const top = ticks[ticks.length - 1] || 1
  // Label a handful of evenly spaced dates rather than every column.
  const labelEvery = Math.max(1, Math.ceil(series.length / 6))
  const total = series.reduce((sum, item) => sum + item.count, 0)
  const peak = series.reduce((best, item) => (item.count > best.count ? item : best), series[0])
  const active = hovered != null ? series[hovered] : null

  return (
    <figure className="trend-chart">
      <div
        className="trend-plot"
        role="img"
        aria-label={`${total} responses across ${series.length} ${series.length === 1 ? 'period' : 'periods'}; peak of ${peak.count} on ${peak.label}.`}
        onMouseLeave={() => setHovered(null)}
      >
        <div className="trend-grid" aria-hidden="true">
          {ticks.slice().reverse().map(tick => (
            <div className="trend-gridline" key={tick}><span>{tick.toLocaleString()}</span></div>
          ))}
        </div>
        <div className="trend-columns">
          {series.map((item, i) => (
            <div
              key={item.key}
              className={`trend-col ${hovered === i ? 'is-active' : ''}`}
              onMouseEnter={() => setHovered(i)}
            >
              <div className="trend-bar" style={{ height: `${(item.count / top) * 100}%` }} />
            </div>
          ))}
        </div>
        {active && (
          <div
            className="trend-tooltip"
            style={{ left: `${((hovered + 0.5) / series.length) * 100}%` }}
            aria-hidden="true"
          >
            <strong>{active.count.toLocaleString()} response{active.count !== 1 ? 's' : ''}</strong>
            <span>{active.label}</span>
          </div>
        )}
      </div>
      <div className="trend-axis" aria-hidden="true">
        {series.map((item, i) => (
          <span key={item.key}>{i % labelEvery === 0 ? item.label.replace('Week of ', '') : ''}</span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Responses per period</caption>
        <thead><tr><th scope="col">Period</th><th scope="col">Responses</th></tr></thead>
        <tbody>
          {series.map(item => (
            <tr key={item.key}><td>{item.label}</td><td>{item.count}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

function sanitizeFilename(value) {
  return String(value || '')
    .replace(/[\\/:*?"<>|]/g, '')
    .trim()
}
