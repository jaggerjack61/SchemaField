import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { getForm, getFormByShareId, submitForm } from '../api'

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

  useEffect(() => {
    loadForm()
  }, [id, shareId])

  async function loadForm() {
    try {
      let data
      if (shareId) {
        const res = await getFormByShareId(shareId)
        data = res.data
      } else {
        const res = await getForm(id)
        data = res.data
      }
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
    } catch (err) {
      setError('Failed to load form. It may not exist.')
    } finally {
      setLoading(false)
    }
  }

  function handleInputChange(questionId, value) {
    setAnswers(prev => ({
      ...prev,
      [questionId]: value
    }))
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
    setSubmitting(true)
    
    try {
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
              formData.append(`answers[${answerIndex}][question_id]`, q.id)
              formData.append(`answers[${answerIndex}][text_answer]`, val)
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
      setErrorMessage('Failed to submit form. Please check your connection and try again.')
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
      </div>

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
                
                {/* Render Inputs */}
                {(question.question_type === 'short_text' || question.question_type === 'number' || question.question_type === 'float') && (
                  <input
                    type={question.question_type === 'short_text' ? 'text' : 'number'}
                    step={question.question_type === 'float' ? 'any' : undefined}
                    required={question.required}
                    value={answers[question.id] || ''}
                    onChange={e => handleInputChange(question.id, e.target.value)}
                    placeholder="Your answer"
                  />
                )}

                {question.question_type === 'long_text' && (
                  <textarea
                    required={question.required}
                    value={answers[question.id] || ''}
                    onChange={e => handleInputChange(question.id, e.target.value)}
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
                       onChange={e => handleInputChange(question.id, e.target.files[0])}
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
