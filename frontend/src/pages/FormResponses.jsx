import { useState, useEffect, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ChartColumn, Clock, Download, FileX, Inbox, LayoutList, Paperclip, Pencil, Sheet, UserRound } from 'lucide-react'
import { getForm, getFormResponses, getFormAnalytics, exportFormResponses } from '../api'

import ResponseSummary from '../components/ResponseSummary'
import Pagination from '../components/Pagination'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import Toast, { useToast } from '../components/Toast'

export default function FormResponses() {
  const { id } = useParams()
  const [form, setForm] = useState(null)
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('summary')
  const [toast, showToast] = useToast()

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
      showToast('Failed to export CSV', 'error')
    }
  }

  if (loading) return <div className="loading"><div className="spinner" /></div>
  if (error) {
    return <EmptyState icon={FileX} title="Couldn’t load responses" description={error} />
  }

  return (
    <div className="responses-page">
      <PageHeader
        back={{ to: '/dashboard', label: 'Forms' }}
        title={form.title}
        subtitle={`${summary.count} response${summary.count !== 1 ? 's' : ''}`}
        actions={
          <>
            <Link to={`/forms/${id}/edit`} className="btn btn-ghost">
              <Pencil aria-hidden="true" /> Edit form
            </Link>
            <button onClick={handleExportCSV} className="btn btn-secondary" disabled={summary.count === 0}>
              <Download aria-hidden="true" /> Export CSV
            </button>
            <Link to={`/forms/${id}/responses/spreadsheet`} className="btn btn-secondary">
              <Sheet aria-hidden="true" /> Spreadsheet
            </Link>
            <Link to={`/forms/${id}/responses/analytics`} className="btn btn-primary">
              <ChartColumn aria-hidden="true" /> Analytics
            </Link>
          </>
        }
      />

      <div className="tabs">
        <button
          aria-pressed={activeTab === 'summary'}
          className={`tab-btn ${activeTab === 'summary' ? 'active' : ''}`}
          onClick={() => setActiveTab('summary')}
        >
          <LayoutList aria-hidden="true" />
          Summary
        </button>
        <button
          aria-pressed={activeTab === 'individual'}
          className={`tab-btn ${activeTab === 'individual' ? 'active' : ''}`}
          onClick={() => setActiveTab('individual')}
        >
          <UserRound aria-hidden="true" />
          Individual
        </button>
      </div>

      {summary.count === 0 ? (
        <EmptyState
          bordered
          icon={Inbox}
          title="No responses yet"
          description="Share your form’s link or QR code, and responses will show up here as they arrive."
        />
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
      <Toast toast={toast} />
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
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {loading ? <div className="loading"><div className="spinner" /></div> : response && (
      <div className="card">
        <div className="response-card-header">
          <span className="response-card-title">Response {page} of {total}</span>
          <span className="response-card-time">
            <Clock size={14} aria-hidden="true" />
            Submission at {new Date(response.created_at).toLocaleString()}
          </span>
        </div>

        <dl className="response-answers">
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
                <a href={answer.file_answer} target="_blank" rel="noopener noreferrer" className="response-file-link">
                  <Paperclip size={14} aria-hidden="true" />
                  {answer.file_answer.split('/').pop()}
                </a>
              )
            }

            return (
              <div className="response-answer" key={answer.id}>
                <dt>{question.text}</dt>
                <dd>{displayAnswer || <span className="no-answer">No answer</span>}</dd>
              </div>
            )
          })}
        </dl>
      </div>
      )}
    </div>
  )
}
