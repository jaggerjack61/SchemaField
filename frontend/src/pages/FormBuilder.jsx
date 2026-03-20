import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getForm, createForm, updateForm } from '../api'
import SectionCard from '../components/SectionCard'

function formatDateTimeInputValue(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const pad = (part) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function serializeFormPayload(form) {
  return {
    ...form,
    deadline: form.deadline ? new Date(form.deadline).toISOString() : null,
  }
}

export default function FormBuilder() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = Boolean(id)
  const fileInputRef = useRef(null)

  const [form, setForm] = useState(getDefaultForm())
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    if (!isEdit) return
    let cancelled = false
    async function load() {
      try {
        const { data } = await getForm(id)
        if (!cancelled) {
          setForm({
            ...data,
            deadline: formatDateTimeInputValue(data.deadline),
          })
        }
      } catch (err) {
        if (!cancelled) showToast('Failed to load form', 'error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [id])

  async function handleSave() {
    setSaving(true)
    try {
      const payload = serializeFormPayload(form)
      if (isEdit) {
        await updateForm(id, payload)
        showToast('Form updated!', 'success')
      } else {
        const { data } = await createForm(payload)
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

  function getDefaultForm() {
    return {
      title: 'Untitled Form',
      description: '',
      deadline: '',
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
    }
  }

  function normalizeTemplate(raw) {
    if (!raw || typeof raw !== 'object') {
      return getDefaultForm()
    }

    const title =
      typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : 'Untitled Form'
    const description = typeof raw.description === 'string' ? raw.description : ''
    const deadline = formatDateTimeInputValue(raw.deadline)
    const sections = Array.isArray(raw.sections) ? raw.sections : []
    const normalizedSections = sections.length
      ? sections.map((section, sectionIndex) => {
          const sectionTitle =
            typeof section?.title === 'string' && section.title.trim()
              ? section.title.trim()
              : `Section ${sectionIndex + 1}`
          const sectionDescription =
            typeof section?.description === 'string' ? section.description : ''
          const questions = Array.isArray(section?.questions) ? section.questions : []
          const normalizedQuestions = questions.map((question, questionIndex) => {
            const questionText =
              typeof question?.text === 'string' && question.text.trim()
                ? question.text.trim()
                : `Question ${questionIndex + 1}`
            const questionType =
              typeof question?.question_type === 'string' && question.question_type.trim()
                ? question.question_type.trim()
                : 'short_text'
            const choices = Array.isArray(question?.choices) ? question.choices : []
            return {
              text: questionText,
              question_type: questionType,
              required: Boolean(question?.required),
              order: questionIndex,
              media_file: question?.media_file || '',
              media_url: question?.media_url || null,
              choices: choices.map((choice, choiceIndex) => ({
                text:
                  typeof choice?.text === 'string' && choice.text.trim()
                    ? choice.text.trim()
                    : `Choice ${choiceIndex + 1}`,
                order: choiceIndex,
              })),
            }
          })
          return {
            title: sectionTitle,
            description: sectionDescription,
            order: sectionIndex,
            questions: normalizedQuestions,
          }
        })
      : getDefaultForm().sections

    return { title, description, deadline, sections: normalizedSections }
  }

  function buildTemplate(formData) {
    const title =
      typeof formData?.title === 'string' && formData.title.trim()
        ? formData.title.trim()
        : 'Untitled Form'
    const description = typeof formData?.description === 'string' ? formData.description : ''
    const deadline = formData?.deadline ? new Date(formData.deadline).toISOString() : null
    const sections = Array.isArray(formData?.sections) ? formData.sections : []

    return normalizeTemplate({ title, description, deadline, sections })
  }

  function getTemplateFileName(formData) {
    const rawName =
      typeof formData?.title === 'string' && formData.title.trim()
        ? formData.title.trim()
        : 'form-template'
    return `${rawName.replace(/[^a-z0-9-_]+/gi, '_').toLowerCase()}.template.json`
  }

  function handleExportTemplate() {
    try {
      const template = buildTemplate(form)
      const blob = new Blob([JSON.stringify(template, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = getTemplateFileName(form)
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      showToast('Template exported', 'success')
    } catch (err) {
      showToast('Failed to export template', 'error')
    }
  }

  function handleImportClick() {
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
      fileInputRef.current.click()
    }
  }

  function handleImportTemplate(event) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result)
        const normalized = normalizeTemplate(parsed)
        setForm(normalized)
        showToast('Template imported', 'success')
      } catch (err) {
        showToast('Invalid template file', 'error')
      }
    }
    reader.onerror = () => {
      showToast('Failed to read template file', 'error')
    }
    reader.readAsText(file)
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
        <div className="form-deadline-row">
          <label className="form-deadline-label" htmlFor="form-deadline">
            Submission deadline
          </label>
          <div className="form-deadline-controls">
            <input
              id="form-deadline"
              className="form-deadline-input"
              type="datetime-local"
              value={form.deadline || ''}
              onChange={(e) => setForm({ ...form, deadline: e.target.value })}
            />
            {form.deadline && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setForm({ ...form, deadline: '' })}
              >
                Clear
              </button>
            )}
          </div>
          <p className="form-deadline-help">
            Leave blank to keep the form open indefinitely.
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="builder-actions">
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : isEdit ? '💾 Save Changes' : '💾 Create Form'}
        </button>
        <button className="btn btn-secondary" onClick={addSection}>
          + Add Section
        </button>
        <button className="btn btn-secondary" onClick={handleExportTemplate}>
          ⬇ Export Template
        </button>
        <button className="btn btn-secondary" onClick={handleImportClick}>
          ⬆ Import Template
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          onChange={handleImportTemplate}
          style={{ display: 'none' }}
        />
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
