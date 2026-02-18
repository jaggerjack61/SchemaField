import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getForm, getFormResponses } from '../api'

const COMMON_STOPWORDS = new Set([
  'about', 'after', 'again', 'against', 'also', 'among', 'because', 'before', 'being', 'below',
  'between', 'could', 'does', 'doing', 'during', 'from', 'have', 'having', 'just', 'more',
  'most', 'other', 'over', 'same', 'some', 'such', 'than', 'that', 'their', 'there', 'these',
  'they', 'this', 'those', 'through', 'very', 'what', 'when', 'where', 'which', 'while', 'with',
  'would', 'your', 'you', 'the', 'and', 'for', 'are', 'not', 'was', 'were', 'can'
])

export default function FormAnalytics() {
  const { id } = useParams()
  const [form, setForm] = useState(null)
  const [responses, setResponses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [trendMode, setTrendMode] = useState('daily')
  const nextFilterIdRef = useRef(2)
  const [filters, setFilters] = useState(() => [createEmptyFilter(1)])

  useEffect(() => {
    loadData()
  }, [id])

  async function loadData() {
    try {
      const [formData, responsesData] = await Promise.all([
        getForm(id),
        getFormResponses(id)
      ])
      setForm(formData.data)
      setResponses(responsesData.data)
    } catch (err) {
      setError('Failed to load analytics data.')
    } finally {
      setLoading(false)
    }
  }

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

  const filteredResponses = useMemo(() => {
    if (!activeFilters.length) return responses

    return responses.filter(response =>
      activeFilters.every(filter => {
        const question = questionById[String(filter.questionId)]
        if (!question) return true
        return matchesResponseFilter(response, question, filter)
      })
    )
  }, [responses, questionById, activeFilters])

  const trendSeries = useMemo(
    () => buildTrendSeries(filteredResponses, trendMode),
    [filteredResponses, trendMode]
  )

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
      mediaMode: ''
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
  if (error) return <div className="empty-state"><h2>{error}</h2></div>

  return (
    <div className="dashboard analytics-page">
      <div className="dashboard-header">
        <div>
          <h1>Analytics: {form.title}</h1>
          <span className="form-count">
            {filteredResponses.length} response{filteredResponses.length !== 1 ? 's' : ''}
            {activeFilters.length ? ` (filtered from ${responses.length})` : ' total'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Link to={`/forms/${id}/responses`} className="btn btn-secondary">
            ← Back to Responses
          </Link>
          <Link to={`/forms/${id}/edit`} className="btn btn-secondary">
            Edit Form
          </Link>
        </div>
      </div>

      <div className="analytics-kpis">
        <KpiCard title="Total Responses" value={filteredResponses.length} />
        <KpiCard title="Questions" value={questionEntries.length} />
        <KpiCard title="Sections" value={form.sections.length} />
      </div>

      <div className="summary-card">
        <div className="analytics-card-header">
          <h2>Filter Responses by Answers</h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-secondary" onClick={addFilter}>
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

                {selectedFilterQuestion && selectedFilterQuestion.question_type !== 'multiple_choice' && selectedFilterQuestion.question_type !== 'multiple_select' && selectedFilterQuestion.question_type !== 'media' && (
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

      <div className="summary-view">
        {form.sections.map(section => (
          <div key={section.id}>
            {form.sections.length > 1 && <h2 style={{ marginBottom: '16px' }}>{section.title}</h2>}

            {section.questions.map(question => (
              <QuestionAnalytics
                key={question.id}
                question={question}
                responses={filteredResponses}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function createEmptyFilter(id) {
  return {
    id,
    questionId: '',
    choiceId: '',
    textQuery: '',
    mediaMode: ''
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

  return (filter.textQuery || '').trim().length > 0
}

function matchesResponseFilter(response, question, filter) {
  const answer = response.answers.find(item => String(item.question) === String(question.id))

  if (question.question_type === 'multiple_choice' || question.question_type === 'multiple_select') {
    if (!filter.choiceId) return true
    const selectedChoices = Array.isArray(answer?.selected_choices) ? answer.selected_choices : []
    return selectedChoices.some(choiceId => String(choiceId) === String(filter.choiceId))
  }

  if (question.question_type === 'media') {
    if (!filter.mediaMode) return true
    const hasFile = Boolean(answer?.file_answer)
    return filter.mediaMode === 'with_file' ? hasFile : !hasFile
  }

  const query = (filter.textQuery || '').trim().toLowerCase()
  if (!query) return true
  const text = (answer?.text_answer || '').toLowerCase()
  return text.includes(query)
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

function QuestionAnalytics({ question, responses }) {
  const answers = responses.flatMap(response =>
    response.answers.filter(answer => answer.question === question.id)
  )

  return (
    <div className="summary-card">
      <div className="summary-question">{question.text}</div>
      <div className="summary-stats">
        {(question.question_type === 'multiple_choice' || question.question_type === 'multiple_select') ? (
          <ChoiceAnalytics question={question} answers={answers} responses={responses} />
        ) : question.question_type === 'media' ? (
          <MediaAnalytics answers={answers} />
        ) : (
          <TextAnalytics answers={answers} />
        )}
      </div>
    </div>
  )
}

function ChoiceAnalytics({ question, answers, responses }) {
  const counts = {}
  question.choices.forEach(choice => {
    counts[choice.id] = 0
  })

  answers.forEach(answer => {
    const selectedChoices = Array.isArray(answer.selected_choices) ? answer.selected_choices : []
    selectedChoices.forEach(choiceId => {
      counts[choiceId] = (counts[choiceId] || 0) + 1
    })
  })

  const answeredResponses = answers.filter(
    answer => Array.isArray(answer.selected_choices) && answer.selected_choices.length > 0
  ).length

  return (
    <div>
      {question.choices.map(choice => {
        const count = counts[choice.id] || 0
        const denominator = question.question_type === 'multiple_select' ? responses.length : Math.max(answeredResponses, 1)
        const percent = denominator > 0 ? Math.round((count / denominator) * 100) : 0

        return (
          <div key={choice.id} className="chart-row">
            <div className="chart-label" title={choice.text}>{choice.text}</div>
            <div className="chart-bar-container">
              <div className="chart-bar-fill" style={{ width: `${percent}%` }} />
            </div>
            <div className="chart-count">{percent}%</div>
          </div>
        )
      })}
      <div className="analytics-footnote">
        {question.question_type === 'multiple_select'
          ? `Selection frequency across ${responses.length} response${responses.length !== 1 ? 's' : ''}`
          : `${answeredResponses} answered response${answeredResponses !== 1 ? 's' : ''}`}
      </div>
    </div>
  )
}

function MediaAnalytics({ answers }) {
  const uploadCount = answers.filter(answer => Boolean(answer.file_answer)).length

  return (
    <div>
      <div className="analytics-kpi-value" style={{ fontSize: '1.8rem' }}>{uploadCount}</div>
      <div className="analytics-footnote">
        file{uploadCount !== 1 ? 's' : ''} uploaded
      </div>
    </div>
  )
}

function TextAnalytics({ answers }) {
  const textValues = answers
    .map(answer => (answer.text_answer || '').trim())
    .filter(Boolean)

  if (!textValues.length) {
    return (
      <div className="analytics-footnote">
        No text responses yet.
      </div>
    )
  }

  const groupedAnswers = {}
  textValues.forEach(text => {
    groupedAnswers[text] = (groupedAnswers[text] || 0) + 1
  })

  const topAnswers = Object.entries(groupedAnswers)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  const keywordCounts = extractKeywords(textValues)

  return (
    <div className="analytics-text-grid">
      <div>
        <div className="analytics-subtitle">Top responses</div>
        {topAnswers.map(([text, count]) => (
          <div key={text} className="chart-row">
            <div className="chart-label analytics-text-label" title={text}>
              {text}
            </div>
            <div className="chart-count">{count}</div>
          </div>
        ))}
      </div>

      <div>
        <div className="analytics-subtitle">Top keywords</div>
        {keywordCounts.length === 0 ? (
          <div className="analytics-footnote">No strong keywords found.</div>
        ) : (
          keywordCounts.slice(0, 8).map(([keyword, count]) => (
            <div key={keyword} className="chart-row">
              <div className="chart-label analytics-text-label">{keyword}</div>
              <div className="chart-count">{count}</div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function extractKeywords(textValues) {
  const tokenCounts = {}

  textValues.forEach(text => {
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(token => token.length >= 4)
      .filter(token => !COMMON_STOPWORDS.has(token))
      .forEach(token => {
        tokenCounts[token] = (tokenCounts[token] || 0) + 1
      })
  })

  return Object.entries(tokenCounts).sort((a, b) => b[1] - a[1])
}

function buildTrendSeries(responses, trendMode) {
  const grouped = {}

  responses.forEach(response => {
    const createdAt = new Date(response.created_at)
    if (Number.isNaN(createdAt.getTime())) return

    if (trendMode === 'weekly') {
      const weekStart = getWeekStart(createdAt)
      const key = weekStart.toISOString().slice(0, 10)
      grouped[key] = (grouped[key] || 0) + 1
      return
    }

    const dayKey = createdAt.toISOString().slice(0, 10)
    grouped[dayKey] = (grouped[dayKey] || 0) + 1
  })

  return Object.entries(grouped)
    .sort((a, b) => new Date(a[0]) - new Date(b[0]))
    .map(([key, count]) => {
      const date = new Date(key)
      return {
        key,
        count,
        label: trendMode === 'weekly'
          ? `Week of ${date.toLocaleDateString()}`
          : date.toLocaleDateString()
      }
    })
}

function getWeekStart(date) {
  const copy = new Date(date)
  const day = copy.getDay()
  copy.setHours(0, 0, 0, 0)
  copy.setDate(copy.getDate() - day)
  return copy
}
