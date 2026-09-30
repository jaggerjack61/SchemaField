import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { CalendarClock, CircleCheck, FileX, LoaderCircle, Lock, TriangleAlert } from 'lucide-react'
import { getForm, getFormByShareId, submitForm } from '../api'
import { mediaFileError } from '../media'
import FormQuestion from '../components/FormQuestion'
import EmptyState from '../components/EmptyState'
import Modal from '../components/Modal'
import Logo from '../components/Logo'

function formatDeadline(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function isFormClosed(deadline) {
  if (!deadline) return false
  const date = new Date(deadline)
  return !Number.isNaN(date.getTime()) && date <= new Date()
}

function normalizeAnswer(question, value) {
  if (typeof value !== 'string') return value
  if (question.question_type === 'short_text' || question.question_type === 'long_text') {
    return value.trim()
  }
  if (question.question_type === 'number') {
    return value.trim()
  }
  if (question.question_type === 'float') {
    return value.trim()
  }
  return value
}

export default function PublicFormView() {
  const { id, shareId } = useParams()
  const [form, setForm] = useState(null)
  const [answers, setAnswers] = useState({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [showErrorModal, setShowErrorModal] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [error, setError] = useState(null)
  const [inputErrors, setInputErrors] = useState({})
  // Rejected uploads are cleared from the answers, so they don't block submitting.
  const [fileErrors, setFileErrors] = useState({})
  const closedAt = formatDeadline(form?.deadline)
  const formIsClosed = isFormClosed(form?.deadline)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        let data
        if (shareId) {
          const res = await getFormByShareId(shareId)
          data = res.data
        } else {
          const res = await getForm(id)
          data = res.data
        }
        if (!cancelled) {
          setForm(data)
          // Initialize answers state
          const initialAnswers = {}
          data.sections.forEach(section => {
            section.questions.forEach(q => {
              if (q.question_type === 'multiple_choice' || q.question_type === 'multiple_select') {
                 initialAnswers[q.id] = []
              } else {
                 initialAnswers[q.id] = ''
              }
            })
          })
          setAnswers(initialAnswers)
        }
      } catch (err) {
        if (!cancelled) setError('Failed to load form. It may not exist.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [id, shareId])

  function handleInputChange(questionId, value) {
    setAnswers(prev => ({
      ...prev,
      [questionId]: value
    }))
  }

  function handleNumberInput(questionId, value) {
    handleInputChange(questionId, value)
    if (value.includes('.')) {
      setInputErrors(prev => ({ ...prev, [questionId]: 'Please enter a whole number — decimals are not allowed.' }))
    } else {
      setInputErrors(prev => { const next = { ...prev }; delete next[questionId]; return next })
    }
  }

  function handleBlur(question, value) {
    const normalized = normalizeAnswer(question, value)
    if (normalized !== value) {
      handleInputChange(question.id, normalized)
    }
  }

  function handleChoiceChange(questionId, choiceId, type) {
    setAnswers(prev => {
      const current = prev[questionId] || []
      if (type === 'multiple_choice') {
        return { ...prev, [questionId]: [choiceId] }
      } else {
        if (current.includes(choiceId)) {
          return { ...prev, [questionId]: current.filter(id => id !== choiceId) }
        } else {
          return { ...prev, [questionId]: [...current, choiceId] }
        }
      }
    })
  }

  function handleFileChange(questionId, file, input) {
    const fileError = file && mediaFileError(file)
    if (fileError) {
      input.value = ''
      handleInputChange(questionId, '')
      setFileErrors(prev => ({ ...prev, [questionId]: fileError }))
      return
    }
    setFileErrors(prev => { const next = { ...prev }; delete next[questionId]; return next })
    handleInputChange(questionId, file)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (Object.keys(inputErrors).length > 0) return
    setSubmitting(true)

    try {
      if (formIsClosed) {
        setErrorMessage(closedAt ? `This form closed on ${closedAt}. New responses are no longer being accepted.` : 'This form is no longer accepting responses.')
        setShowErrorModal(true)
        return
      }

      // Use FormData to handle potential file uploads
      const formData = new FormData()
      
      let answerIndex = 0
      form.sections.forEach(section => {
        section.questions.forEach(q => {
          const val = answers[q.id]
          
          if (q.question_type === 'multiple_choice' || q.question_type === 'multiple_select') {
            if (val && val.length > 0) {
               formData.append(`answers[${answerIndex}][question_id]`, q.id)
               val.forEach(choiceId => {
                 formData.append(`answers[${answerIndex}][selected_choices]`, choiceId)
               })
               answerIndex++
            }
          } else if (q.question_type === 'media') {
            if (val) {
               formData.append(`answers[${answerIndex}][question_id]`, q.id)
               formData.append(`answers[${answerIndex}][file_answer]`, val)
               answerIndex++
            }
          } else {
            // text/number
            if (val) {
              const normalized = normalizeAnswer(q, val)
              formData.append(`answers[${answerIndex}][question_id]`, q.id)
              formData.append(`answers[${answerIndex}][text_answer]`, normalized)
              answerIndex++
            }
          }
        })
      })

      // If form requires multipart, Axios handles it if data is FormData
      await submitForm(form.share_id, answerIndex ? formData : { answers: [] })
      setSubmitted(true)
    } catch (err) {
      console.error(err)
      const errors = err.response?.data
      // The server reports the deadline in UTC; show it in the respondent's time zone.
      const serverClosedAt = formatDeadline(errors?.deadline)
      setErrorMessage(serverClosedAt ? `This form closed on ${serverClosedAt}. New responses are no longer being accepted.` : errors?.detail || (errors ? Object.values(errors).flat().map(value => typeof value === 'string' ? value : JSON.stringify(value)).join(' ') : 'Failed to submit form. Please check your connection and try again.'))
      setShowErrorModal(true)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="loading"><div className="spinner" /></div>
  if (error) {
    return (
      <EmptyState
        icon={FileX}
        title="Form unavailable"
        description="This form couldn’t be loaded. The link may be incorrect, or the form may have been removed."
      />
    )
  }
  if (submitted) {
    return (
      <div className="respond-page">
        <div className="card respond-done">
          <EmptyState
            icon={CircleCheck}
            tone="success"
            title="Thank you!"
            description="Your response has been recorded."
            action={
              <button className="btn btn-secondary" onClick={() => window.location.reload()}>
                Submit another response
              </button>
            }
          />
        </div>
        <PoweredBy />
      </div>
    )
  }

  const hasRequired = form.sections.some(section => section.questions.some(q => q.required))

  return (
    <div className="respond-page">
      <header className="card respond-header">
        <h1>{form.title}</h1>
        {form.description && <p className="respond-description">{form.description}</p>}
        {(closedAt || (hasRequired && !formIsClosed)) && (
          <div className="respond-meta">
            {closedAt && (
              <span className={`badge ${formIsClosed ? 'badge-danger' : 'badge-accent'}`}>
                {formIsClosed ? <Lock aria-hidden="true" /> : <CalendarClock aria-hidden="true" />}
                {formIsClosed ? `Closed on ${closedAt}` : `Open until ${closedAt}`}
              </span>
            )}
            {hasRequired && !formIsClosed && (
              <span className="respond-required-note"><span className="required-star">*</span> Required</span>
            )}
          </div>
        )}
      </header>

      {formIsClosed ? (
        <div className="card">
          <EmptyState
            icon={Lock}
            title="This form is closed"
            description={closedAt
              ? `The submission deadline passed on ${closedAt}. New responses are no longer being accepted.`
              : 'This form is no longer accepting responses.'}
          />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="respond-form">
          {form.sections.map((section, si) => (
            <section className="card respond-section" key={si}>
              {(form.sections.length > 1 || section.description) && (
                <div className="respond-section-head">
                  <h2>{section.title}</h2>
                  {section.description && <p>{section.description}</p>}
                </div>
              )}
              {section.questions.map((question, qi) => (
                <FormQuestion
                  key={qi}
                  question={question}
                  index={qi}
                  value={answers[question.id]}
                  error={inputErrors[question.id] || fileErrors[question.id]}
                  onChange={value => question.question_type === 'number'
                    ? handleNumberInput(question.id, value)
                    : handleInputChange(question.id, value)}
                  onBlur={value => handleBlur(question, value)}
                  onToggleChoice={choiceId => handleChoiceChange(question.id, choiceId, question.question_type)}
                  onFile={(file, input) => handleFileChange(question.id, file, input)}
                />
              ))}
            </section>
          ))}

          <div className="respond-actions">
            <button type="submit" className="btn btn-primary btn-lg" disabled={submitting}>
              {submitting && <LoaderCircle className="btn-spinner" aria-hidden="true" />}
              {submitting ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        </form>
      )}

      <PoweredBy />

      {showErrorModal && (
        <Modal
          size="sm"
          title="Submission failed"
          description={errorMessage}
          icon={<TriangleAlert />}
          tone="danger"
          onClose={() => setShowErrorModal(false)}
          footer={
            <button className="btn btn-primary" onClick={() => setShowErrorModal(false)}>
              OK
            </button>
          }
        />
      )}
    </div>
  )
}

function PoweredBy() {
  return (
    <p className="respond-powered">
      <Logo size={16} /> Powered by SchemaField
    </p>
  )
}
