import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { getForm, getFormByShareId, submitForm } from '../api'

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

function getMediaType(url) {
  if (!url) return null
  const ext = url.split('.').pop().split('?')[0].toLowerCase()
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return 'image'
  if (['mp4', 'webm', 'ogg'].includes(ext)) return 'video'
  if (['mp3', 'wav', 'ogg', 'webm', 'm4a'].includes(ext)) return 'audio'
  return null
}

function QuestionMedia({ question }) {
  const mediaUrl = question.media_url || (question.media_file ? `/media/${question.media_file}` : null)
  const mediaType = getMediaType(mediaUrl)
  if (!mediaUrl) return null

  return (
    <div className="question-media-display" style={{ margin: '10px 0' }}>
      {mediaType === 'image' && (
        <img src={mediaUrl} alt="Question media" style={{ maxWidth: '100%', maxHeight: '320px', borderRadius: '8px' }} />
      )}
      {mediaType === 'video' && (
        <video src={mediaUrl} controls style={{ maxWidth: '100%', maxHeight: '320px', borderRadius: '8px' }} />
      )}
      {mediaType === 'audio' && (
        <audio src={mediaUrl} controls style={{ width: '100%' }} />
      )}
    </div>
  )
}

function normalizeAnswer(question, value) {
  if (typeof value !== 'string') return value
  if (question.question_type === 'short_text' || question.question_type === 'long_text') {
    return value.trim()
  }
  if (question.question_type === 'number') {
    if (value.trim() === '' || value.trim() === '-') return value
    const n = parseInt(value, 10)
    return isNaN(n) ? value : String(n)
  }
  if (question.question_type === 'float') {
    if (value.trim() === '' || value.trim() === '-') return value
    const n = parseFloat(value)
    return isNaN(n) ? value : String(n)
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
      await submitForm(form.id, formData)
      setSubmitted(true)
    } catch (err) {
      console.error(err)
      setErrorMessage(err.response?.data?.detail || 'Failed to submit form. Please check your connection and try again.')
      setShowErrorModal(true)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="loading"><div className="spinner" /></div>
  if (error) return <div className="empty-state"><h2>{error}</h2></div>
  if (submitted) {
     return (
       <div className="preview-container" style={{ textAlign: 'center', padding: '60px 20px' }}>
         <div style={{ fontSize: '4rem', marginBottom: '20px' }}>🎉</div>
         <h1>Thank you!</h1>
         <p>Your response has been recorded.</p>
         <button className="btn btn-secondary" onClick={() => window.location.reload()}>
           Submit another response
         </button>
       </div>
     )
  }

  return (
    <div className="preview-container">
      <div className="preview-header">
        <h1>{form.title}</h1>
        {form.description && <p>{form.description}</p>}
        {closedAt && (
          <div className={`form-deadline-banner ${formIsClosed ? 'is-closed' : ''}`}>
            {formIsClosed ? `Closed on ${closedAt}` : `Open until ${closedAt}`}
          </div>
        )}
      </div>

      {formIsClosed ? (
        <div className="preview-closed-state">
          <div className="empty-icon">⏳</div>
          <h2>This form is closed</h2>
          <p>
            {closedAt
              ? `The submission deadline passed on ${closedAt}. New responses are no longer being accepted.`
              : 'This form is no longer accepting responses.'}
          </p>
        </div>
      ) : (

      <form onSubmit={handleSubmit}>
        {form.sections.map((section, si) => (
          <div className="preview-section" key={si}>
            <h2>{section.title}</h2>
            {section.description && <div className="section-desc-text">{section.description}</div>}

            {section.questions.map((question, qi) => (
              <div className="preview-question" key={qi}>
                <label>
                  {question.text}
                  {question.required && <span className="required-star">*</span>}
                </label>
                <QuestionMedia question={question} />
                
                {/* Render Inputs */}
                {(question.question_type === 'short_text' || question.question_type === 'number' || question.question_type === 'float') && (
                  <>
                    <input
                      type={question.question_type === 'short_text' ? 'text' : 'number'}
                      step={question.question_type === 'float' ? 'any' : question.question_type === 'number' ? '1' : undefined}
                      required={question.required}
                      value={answers[question.id] || ''}
                      onChange={e => question.question_type === 'number'
                        ? handleNumberInput(question.id, e.target.value)
                        : handleInputChange(question.id, e.target.value)
                      }
                      onBlur={e => handleBlur(question, e.target.value)}
                      placeholder="Your answer"
                      style={inputErrors[question.id] ? { borderColor: 'var(--error, #e05252)' } : undefined}
                    />
                    {inputErrors[question.id] && (
                      <span style={{ color: 'var(--error, #e05252)', fontSize: '0.8rem', marginTop: '4px', display: 'block' }}>
                        {inputErrors[question.id]}
                      </span>
                    )}
                  </>
                )}

                {question.question_type === 'long_text' && (
                  <textarea
                    required={question.required}
                    value={answers[question.id] || ''}
                    onChange={e => handleInputChange(question.id, e.target.value)}
                    onBlur={e => handleBlur(question, e.target.value)}
                    placeholder="Your answer"
                    rows={3}
                  />
                )}

                {(question.question_type === 'multiple_choice' || question.question_type === 'multiple_select') && (
                  <div>
                    {question.choices.map((choice, ci) => (
                      <div className="preview-choice" key={ci}>
                        <input
                          type={question.question_type === 'multiple_choice' ? 'radio' : 'checkbox'}
                          name={`q-${question.id}`}
                          required={question.required && (!answers[question.id] || answers[question.id].length === 0)}
                          checked={answers[question.id]?.includes(choice.id)}
                          onChange={() => handleChoiceChange(question.id, choice.id, question.question_type)}
                        />
                        <span>{choice.text}</span>
                      </div>
                    ))}
                  </div>
                )}
                
                {question.question_type === 'media' && (
                   <div style={{ marginTop: '8px' }}>
                     <input 
                       type="file" 
                       required={question.required}
                       accept="image/*,video/*,audio/*"
                       onChange={e => {
                         const file = e.target.files[0]
                         if (file && file.size > 10 * 1024 * 1024) {
                           alert('File too large. Maximum size is 10 MB.')
                           e.target.value = ''
                           return
                         }
                         handleInputChange(question.id, file)
                       }}
                     />
                   </div>
                )}
              </div>
            ))}
          </div>
        ))}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit'}
          </button>
        </div>
      </form>
      )}

      {/* Error Modal */}
      {showErrorModal && (
        <div className="share-modal-overlay" onClick={() => setShowErrorModal(false)}>
          <div className="share-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
            <h3>Submission Failed</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>{errorMessage}</p>
            <button className="btn btn-primary" onClick={() => setShowErrorModal(false)}>
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
