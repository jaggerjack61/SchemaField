import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ChartColumn, Eye, FileX, Pencil } from 'lucide-react'
import { getForm } from '../api'
import FormQuestion from '../components/FormQuestion'
import EmptyState from '../components/EmptyState'

export default function FormPreview() {
  const { id } = useParams()
  const [form, setForm] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const { data } = await getForm(id)
        if (!cancelled) setForm(data)
      } catch (err) {
        if (!cancelled) console.error('Failed to load form', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [id])

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
      </div>
    )
  }

  if (!form) {
    return (
      <EmptyState
        icon={FileX}
        title="Form not found"
        description="This form doesn’t exist or you no longer have access to it."
        action={<Link to="/dashboard" className="btn btn-primary">Back to forms</Link>}
      />
    )
  }

  return (
    <div className="respond-page">
      <div className="preview-banner">
        <div className="preview-banner-text">
          <Eye size={16} aria-hidden="true" />
          <span><strong>Preview</strong> — this is how respondents will see your form.</span>
        </div>
        <div className="preview-banner-actions">
          <Link to={`/forms/${id}/responses`} className="btn btn-secondary btn-sm">
            <ChartColumn aria-hidden="true" /> Responses
          </Link>
          <Link to={`/forms/${id}/edit`} className="btn btn-primary btn-sm">
            <Pencil aria-hidden="true" /> Edit Form
          </Link>
        </div>
      </div>

      <header className="card respond-header">
        <h1>{form.title}</h1>
        {form.description && <p className="respond-description">{form.description}</p>}
      </header>

      <div className="respond-form">
        {form.sections.map((section, si) => (
          <section className="card respond-section" key={si}>
            {(form.sections.length > 1 || section.description) && (
              <div className="respond-section-head">
                <h2>{section.title}</h2>
                {section.description && <p>{section.description}</p>}
              </div>
            )}
            {section.questions.length === 0 && (
              <p className="text-muted">This section has no questions yet.</p>
            )}
            {section.questions.map((question, qi) => (
              <FormQuestion key={qi} question={question} index={`${si}-${qi}`} readOnly />
            ))}
          </section>
        ))}
      </div>

      <div className="respond-actions">
        <Link to="/dashboard" className="btn btn-secondary">Back to forms</Link>
      </div>
    </div>
  )
}
