import { useState, useEffect, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getForm, getFormResponses, getFormAnalytics, exportFormResponses } from '../api'

import ResponseSummary from '../components/ResponseSummary'
import Pagination from '../components/Pagination'

export default function FormResponses() {
  const { id } = useParams()
  const [form, setForm] = useState(null)
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('summary')

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    async function load() {
      try {
        const [formRes, responsesRes] = await Promise.all([getForm(id), getFormAnalytics(id, {}, controller.signal)])
        if (!cancelled) {
          setForm(formRes.data)
          setSummary(responsesRes.data)
        }
      } catch (err) {
        if (!cancelled) setError('Failed to load data.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true; controller.abort() }
  }, [id])

  // Create lookup for questions — must be before any early returns
  const { questionsMap, choicesMap } = useMemo(() => {
    const qMap = {}
    const cMap = {}
    if (!form) return { questionsMap: qMap, choicesMap: cMap }
    form.sections.forEach(s => {
      s.questions.forEach(q => {
        qMap[q.id] = q
        if (q.choices) {
          q.choices.forEach(c => {
            cMap[c.id] = c.text
          })
        }
      })
    })
    return { questionsMap: qMap, choicesMap: cMap }
  }, [form])

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
           <h1>Responses: {form.title}</h1>
           <span className="form-count">{summary.count} response{summary.count !== 1 ? 's' : ''}</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Link
            to={`/forms/${id}/responses/analytics`}
            className="btn btn-primary"
          >
            📊 View Analytics
          </Link>
          <Link to={`/forms/${id}/responses/spreadsheet`} className="btn btn-secondary">
            📋 View Spreadsheet
          </Link>
          <button onClick={handleExportCSV} className="btn btn-secondary">
            ⬇ Export CSV
          </button>
          <Link to={`/forms/${id}/edit`} className="btn btn-secondary">
            ← Back to Editor
          </Link>
        </div>
      </div>

      <div className="tabs">
        <button 
          className={`tab-btn ${activeTab === 'summary' ? 'active' : ''}`}
          onClick={() => setActiveTab('summary')}
        >
          Summary
        </button>
        <button 
          className={`tab-btn ${activeTab === 'individual' ? 'active' : ''}`}
          onClick={() => setActiveTab('individual')}
        >
          Individual
        </button>
      </div>

      {summary.count === 0 ? (
        <div className="empty-state">
           <div className="empty-icon">📭</div>
           <h2>No responses yet</h2>
           <p>Share your form link to get started!</p>
        </div>
      ) : activeTab === 'summary' ? (
        <ResponseSummary form={form} summary={summary} />
      ) : (
        <IndividualView 
          key={id}
          formId={id}
          questionsMap={questionsMap} 
          choicesMap={choicesMap} 
        />
      )}
    </div>
  )
}

function IndividualView({ formId, questionsMap, choicesMap }) {
  const [page, setPage] = useState(1)
  const [response, setResponse] = useState(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    setLoading(true)
    setError('')
    getFormResponses(formId, { page, page_size: 1 }, controller.signal)
      .then(({ data }) => { if (!cancelled) { setResponse(data.results[0] || null); setTotal(data.count) } })
      .catch(() => { if (!cancelled) setError('Failed to load response.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true; controller.abort() }
  }, [formId, page])

  return (
    <div className="individual-view">
      <Pagination page={page} pageSize={1} count={total} onPage={setPage} disabled={loading} />
      {error && <p role="alert">{error}</p>}
      {loading ? <div className="loading"><div className="spinner" /></div> : response && (
      <div className="form-card" style={{ cursor: 'default' }}>
         <div className="form-card-title">
            Submission at {new Date(response.created_at).toLocaleString()}
         </div>
         
         <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
           {response.answers.map(answer => {
             const question = questionsMap[answer.question]
             if (!question) return null
             
             let displayAnswer = answer.text_answer
             
             if (question.question_type === 'multiple_choice' || question.question_type === 'multiple_select') {
                displayAnswer = answer.selected_choices
                  .map(choiceId => choicesMap[choiceId] || '?')
                  .join(', ')
             } else if (question.question_type === 'media' && answer.file_answer) {
                displayAnswer = (
                  <a href={answer.file_answer} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>
                    View File 
                  </a>
                )
             }

             return (
               <div key={answer.id}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    {question.text}
                  </div>
                  <div style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                    {displayAnswer || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No answer</span>}
                  </div>
               </div>
             )
           })}
         </div>
      </div>
      )}
    </div>
  )
}
