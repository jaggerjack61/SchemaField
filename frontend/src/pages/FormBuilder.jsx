import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getForm, createForm, updateForm } from '../api'
import SectionCard from '../components/SectionCard'

export default function FormBuilder() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = Boolean(id)

  const [form, setForm] = useState({
    title: 'Untitled Form',
    description: '',
    sections: [
      {
        title: 'Section 1',
        description: '',
        order: 0,
        questions: [
          {
            text: 'Untitled Question',
            question_type: 'short_text',
            required: false,
            order: 0,
            choices: [],
          },
        ],
      },
    ],
  })
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    if (isEdit) {
      loadForm()
    }
  }, [id])

  async function loadForm() {
    try {
      const { data } = await getForm(id)
      setForm(data)
    } catch (err) {
      showToast('Failed to load form', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      if (isEdit) {
        await updateForm(id, form)
        showToast('Form updated!', 'success')
      } else {
        const { data } = await createForm(form)
        showToast('Form created!', 'success')
        setTimeout(() => navigate(`/forms/${data.id}/edit`), 500)
      }
    } catch (err) {
      console.error(err)
      const msg = err.response?.data?.detail || 'Failed to save form'
      showToast(msg, 'error')
    } finally {
      setSaving(false)
    }
  }

  function showToast(message, type) {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  function updateSection(sectionIndex, updatedSection) {
    const newSections = form.sections.map((s, i) =>
      i === sectionIndex ? updatedSection : s
    )
    setForm({ ...form, sections: newSections })
  }

  function addSection() {
    const newSection = {
      title: `Section ${form.sections.length + 1}`,
      description: '',
      order: form.sections.length,
      questions: [],
    }
    setForm({ ...form, sections: [...form.sections, newSection] })
  }

  function removeSection(sectionIndex) {
    if (form.sections.length <= 1) {
      showToast('A form must have at least one section', 'error')
      return
    }
    const newSections = form.sections
      .filter((_, i) => i !== sectionIndex)
      .map((s, i) => ({ ...s, order: i }))
    setForm({ ...form, sections: newSections })
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div className="builder-container">
      {/* Form title & description */}
      <div className="builder-header">
        <input
          className="form-title-input"
          type="text"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Form title"
        />
        <textarea
          className="form-desc-input"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Form description (optional)"
          rows={2}
        />
      </div>

      {/* Action buttons */}
      <div className="builder-actions">
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : isEdit ? '💾 Save Changes' : '💾 Create Form'}
        </button>
        <button className="btn btn-secondary" onClick={addSection}>
          + Add Section
        </button>
        {isEdit && (
          <>
            <button
              className="btn btn-secondary"
              onClick={() => navigate(`/forms/${id}/preview`)}
            >
              👁 Preview
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                const url = `${window.location.origin}/forms/${id}/view`
                navigator.clipboard.writeText(url)
                showToast('Link copied to clipboard!', 'success')
              }}
            >
              🔗 Share
            </button>
          </>
        )}
      </div>

      {/* Sections */}
      <div className="sections-list">
        {form.sections.map((section, si) => (
          <SectionCard
            key={si}
            section={section}
            sectionIndex={si}
            onChange={(updated) => updateSection(si, updated)}
            onRemove={() => removeSection(si)}
          />
        ))}
      </div>

      {/* Toast */}
      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </div>
  )
}
