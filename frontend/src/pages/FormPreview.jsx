import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getForm } from '../api'

export default function FormPreview() {
  const { id } = useParams()
  const [form, setForm] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadForm()
  }, [id])

  async function loadForm() {
    try {
      const { data } = await getForm(id)
      setForm(data)
    } catch (err) {
      console.error('Failed to load form', err)
    } finally {
      setLoading(false)
    }
  }

  function renderQuestionInput(question) {
    switch (question.question_type) {
      case 'short_text':
        return <input type="text" placeholder="Your answer" readOnly />
      case 'long_text':
        return <textarea placeholder="Your answer" rows={3} readOnly />
      case 'number':
        return <input type="number" placeholder="0" readOnly />
      case 'float':
        return <input type="number" step="0.01" placeholder="0.00" readOnly />
      case 'multiple_choice':
        return (
          <div>
            {question.choices.map((choice, i) => (
              <div className="preview-choice" key={i}>
                <input type="radio" name={`q-${question.id || i}`} disabled />
                <span>{choice.text}</span>
              </div>
            ))}
          </div>
        )
      case 'multiple_select':
        return (
          <div>
            {question.choices.map((choice, i) => (
              <div className="preview-choice" key={i}>
                <input type="checkbox" disabled />
                <span>{choice.text}</span>
              </div>
            ))}
          </div>
        )
      case 'media':
        return <input type="file" disabled />
      default:
        return null
    }
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
      </div>
    )
  }

  if (!form) {
    return (
      <div className="empty-state">
        <h2>Form not found</h2>
        <Link to="/" className="btn btn-primary">← Back to Dashboard</Link>
      </div>
    )
  }

  return (
    <div className="preview-container">
      <div className="preview-header">
        <h1>{form.title}</h1>
        {form.description && <p>{form.description}</p>}
      </div>

      {form.sections.map((section, si) => (
        <div className="preview-section" key={si}>
          <h2>{section.title}</h2>
          {section.description && (
            <div className="section-desc-text">{section.description}</div>
          )}

          {section.questions.map((question, qi) => (
            <div className="preview-question" key={qi}>
              <label>
                {question.text}
                {question.required && <span className="required-star">*</span>}
              </label>
              {renderQuestionInput(question)}
            </div>
          ))}
        </div>
      ))}

      <div style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
        <Link to={`/forms/${id}/edit`} className="btn btn-secondary">
          ✏️ Edit Form
        </Link>
        <Link to="/" className="btn btn-secondary">
          ← Back to Dashboard
        </Link>
      </div>
    </div>
  )
}
