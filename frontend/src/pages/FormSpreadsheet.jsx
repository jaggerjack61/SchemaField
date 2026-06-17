import { useState, useEffect, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getForm, getFormResponses, exportFormResponses } from '../api'

export default function FormSpreadsheet() {
  const { id } = useParams()
  const [form, setForm] = useState(null)
  const [responses, setResponses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sort, setSort] = useState({ key: 'submittedAt', direction: 'desc' })

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [formRes, responsesRes] = await Promise.all([
          getForm(id),
          getFormResponses(id),
        ])
        if (!cancelled) {
          setForm(formRes.data)
          setResponses(responsesRes.data.results || responsesRes.data)
        }
      } catch (err) {
        if (!cancelled) setError('Failed to load data.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [id])

  const { columns, rows } = useMemo(() => {
    if (!form) return { columns: [], rows: [] }

    const questions = []
    form.sections.forEach((section) => {
      section.questions.forEach((q) => questions.push(q))
    })

    const cols = [
      { key: 'id', label: 'Response ID', width: 130, sortable: true },
      { key: 'submittedAt', label: 'Submitted At', width: 170, sortable: true },
      ...questions.map((q) => ({
        key: q.id,
        label: q.text,
        width: 220,
        sortable: true,
        question: q,
      })),
    ]

    const answerRows = responses.map((r) => {
      const answersMap = {}
      r.answers.forEach((a) => {
        answersMap[a.question] = a
      })

      const row = { id: r.id, submittedAt: r.created_at }
      questions.forEach((q) => {
        const answer = answersMap[q.id]
        row[q.id] = formatSortableAnswer(answer, q)
        row[`__isMedia_${q.id}`] = q.question_type === 'media' && answer?.file_answer
      })
      return row
    })

    return { columns: cols, rows: answerRows }
  }, [form, responses])

  const sortedRows = useMemo(() => {
    if (!sort.key) return rows

    return [...rows].sort((a, b) => {
      let aVal = a[sort.key]
      let bVal = b[sort.key]

      if (sort.key === 'submittedAt') {
        aVal = new Date(aVal).getTime()
        bVal = new Date(bVal).getTime()
      } else if (sort.key === 'id') {
        aVal = Number(aVal)
        bVal = Number(bVal)
      } else {
        aVal = String(aVal || '').toLowerCase()
        bVal = String(bVal || '').toLowerCase()
      }

      if (aVal < bVal) return sort.direction === 'asc' ? -1 : 1
      if (aVal > bVal) return sort.direction === 'asc' ? 1 : -1
      return 0
    })
  }, [rows, sort])

  function handleSort(key) {
    setSort((current) => {
      if (current.key === key) {
        if (current.direction === 'asc') return { key, direction: 'desc' }
        if (current.direction === 'desc') return { key: null, direction: null }
      }
      return { key, direction: 'asc' }
    })
  }

  async function handleExportCSV() {
    try {
      const response = await exportFormResponses(id)
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `${form.title}_responses.csv`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to export CSV', err)
      alert('Failed to export CSV')
    }
  }

  if (loading) return <div className="loading"><div className="spinner" /></div>
  if (error) return <div className="empty-state"><h2>{error}</h2></div>

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <h1>Spreadsheet: {form.title}</h1>
          <span className="form-count">{responses.length} response{responses.length !== 1 ? 's' : ''}</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handleExportCSV} className="btn btn-secondary">
            ⬇ Export CSV
          </button>
          <Link to={`/forms/${id}/responses`} className="btn btn-secondary">
            ← Back to Responses
          </Link>
        </div>
      </div>

      {responses.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📭</div>
          <h2>No responses yet</h2>
          <p>Share your form link to get started!</p>
        </div>
      ) : (
        <div className="spreadsheet-wrapper">
          <div className="spreadsheet-scroll">
            <table className="spreadsheet-table">
              <thead>
                <tr>
                  {columns.map((col, i) => (
                    <th
                      key={col.key}
                      className={[
                        i === 0 ? 'row-header' : '',
                        col.sortable ? 'sortable' : '',
                        sort.key === col.key ? 'sorted' : '',
                      ].join(' ')}
                      style={{ minWidth: col.width, maxWidth: col.width }}
                      onClick={() => col.sortable && handleSort(col.key)}
                      title={col.label}
                    >
                      <span className="spreadsheet-header-content">
                        <span className="spreadsheet-header-label">{col.label}</span>
                        {col.sortable && (
                          <span className="spreadsheet-sort-icons" aria-hidden="true">
                            <span className={sort.key === col.key && sort.direction === 'asc' ? 'active' : ''}>
                              ▲
                            </span>
                            <span className={sort.key === col.key && sort.direction === 'desc' ? 'active' : ''}>
                              ▼
                            </span>
                          </span>
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => (
                  <tr key={row.id}>
                    {columns.map((col, colIndex) => (
                      <td
                        key={col.key}
                        className={colIndex === 0 ? 'row-header' : ''}
                        style={{ minWidth: col.width, maxWidth: col.width }}
                        title={typeof row[col.key] === 'string' ? row[col.key] : undefined}
                      >
                        {col.key === 'submittedAt'
                          ? new Date(row[col.key]).toLocaleString()
                          : row[`__isMedia_${col.key}`]
                            ? (
                              <a
                                href={row[col.key]}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="spreadsheet-link"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {row[col.key].split('/').pop()}
                              </a>
                            )
                            : row[col.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function formatSortableAnswer(answer, question) {
  if (!answer) return ''

  if (['multiple_choice', 'multiple_select'].includes(question.question_type)) {
    const choices = Array.isArray(answer.selected_choices)
      ? answer.selected_choices
      : answer.selected_choices
        ? [answer.selected_choices]
        : []
    if (choices.length === 0) return ''

    const choiceMap = {}
    if (question.choices) {
      question.choices.forEach((c) => {
        choiceMap[c.id] = c.text
      })
    }
    return choices.map((cId) => choiceMap[cId] || cId).join(', ')
  }

  if (question.question_type === 'media') {
    return answer.file_answer || ''
  }

  return answer.text_answer || ''
}
