import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useParams, useNavigate, useLocation } from 'react-router-dom'
import { ChevronLeft, Download, Eye, LoaderCircle, Plus, Save, Share2, Upload } from 'lucide-react'
import { getForm, createForm, updateForm } from '../api'
import SectionCard from '../components/SectionCard'
import ShareModal from '../components/ShareModal'
import Toast, { useToast } from '../components/Toast'
import { useConfirm } from '../components/ConfirmDialog'
import { toPayload, withKeys } from '../formBuilderState'

function formatDateTimeInputValue(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const pad = (part) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function fromServer(data) {
  return withKeys({ ...data, deadline: formatDateTimeInputValue(data.deadline) })
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

export default function FormBuilder() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const isEdit = Boolean(id)
  const fileInputRef = useRef(null)

  const [form, setForm] = useState(() => withKeys(getDefaultForm()))
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [pendingUploads, setPendingUploads] = useState(0)
  const [shareOpen, setShareOpen] = useState(false)
  const [toast, showToast] = useToast()
  const [confirm, confirmDialog] = useConfirm()

  // A notice handed over by the create flow; cleared so a reload doesn't repeat it.
  useEffect(() => {
    const notice = location.state?.notice
    if (!notice) return
    showToast(notice, 'success')
    navigate(location.pathname, { replace: true, state: null })
  }, [location.state, location.pathname, navigate, showToast])

  useEffect(() => {
    if (!isEdit) return
    let cancelled = false
    async function load() {
      try {
        const { data } = await getForm(id)
        if (!cancelled) setForm(fromServer(data))
      } catch (err) {
        if (!cancelled) showToast('Failed to load form', 'error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [id, isEdit, showToast])

  async function handleSave() {
    setSaving(true)
    try {
      const payload = toPayload(form)
      if (isEdit) {
        const { data } = await updateForm(id, payload)
        setForm(fromServer(data))
        showToast('Form updated!', 'success')
      } else {
        const { data } = await createForm(payload)
        // Replace, so Back doesn't return to a "new form" page holding this form.
        navigate(`/forms/${data.id}/edit`, { replace: true, state: { notice: 'Form created!' } })
      }
    } catch (err) {
      console.error(err)
      const errors = err.response?.data
      const msg = errors?.detail || (errors ? Object.values(errors).flat().map(value => typeof value === 'string' ? value : JSON.stringify(value)).join(' ') : 'Failed to save form')
      showToast(msg, 'error')
    } finally {
      setSaving(false)
    }
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
    reader.onload = async () => {
      let normalized
      try {
        normalized = normalizeTemplate(JSON.parse(reader.result))
      } catch (err) {
        showToast('Invalid template file', 'error')
        return
      }
      if (isEdit && !await confirm({
        title: 'Replace this form’s content?',
        message: 'Importing replaces every section and question in this form. Questions that already have responses can’t be removed, so saving will fail if this form has responses.',
        confirmLabel: 'Import template',
        tone: 'danger',
      })) {
        return
      }
      // Keep this form's identity so sharing still works before the next save.
      setForm(current => withKeys({
        ...normalized,
        id: current.id,
        share_id: current.share_id,
        qr_code: current.qr_code,
      }))
      showToast('Template imported', 'success')
    }
    reader.onerror = () => {
      showToast('Failed to read template file', 'error')
    }
    reader.readAsText(file)
  }

  function updateFormField(field, value) {
    setForm(current => ({ ...current, [field]: value }))
  }

  const updateSection = useCallback((sectionKey, update) => {
    setForm(current => ({
      ...current,
      sections: current.sections.map(s => (s._key === sectionKey ? update(s) : s)),
    }))
  }, [])

  const removeSection = useCallback(async (sectionKey, questionCount) => {
    if (questionCount > 0 && !await confirm({
      title: 'Delete section?',
      message: `This section and its ${questionCount} question${questionCount !== 1 ? 's' : ''} will be removed when you save.`,
      confirmLabel: 'Delete section',
      tone: 'danger',
    })) {
      return
    }
    setForm(current => (current.sections.length <= 1 ? current : {
      ...current,
      sections: current.sections.filter(s => s._key !== sectionKey),
    }))
  }, [confirm])

  const handleUploadStateChange = useCallback((delta) => {
    setPendingUploads(count => count + delta)
  }, [])

  function addSection() {
    setForm(current => withKeys({
      ...current,
      sections: [...current.sections, {
        title: `Section ${current.sections.length + 1}`,
        description: '',
        questions: [],
      }],
    }))
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
      </div>
    )
  }

  const saveLabel = saving ? 'Saving…' : pendingUploads > 0 ? 'Uploading media…' : isEdit ? 'Save Changes' : 'Create Form'

  return (
    <div className="builder-container">
      <fieldset disabled={saving} className="builder-fieldset">
      {/* Sticky action bar */}
      <div className="builder-toolbar">
        <Link to="/dashboard" className="page-back builder-back">
          <ChevronLeft size={16} aria-hidden="true" />
          <span>Forms</span>
        </Link>
        <span className="builder-toolbar-title" title={form.title}>
          {isEdit ? form.title || 'Untitled Form' : 'New form'}
        </span>
        <div className="builder-toolbar-actions">
          <button className="btn btn-ghost btn-sm" onClick={handleImportClick} title="Import a template (.json)">
            <Upload aria-hidden="true" /> <span className="hide-sm">Import</span>
          </button>
          <button className="btn btn-ghost btn-sm" onClick={handleExportTemplate} title="Export as template (.json)">
            <Download aria-hidden="true" /> <span className="hide-sm">Export</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={handleImportTemplate}
            hidden
          />
          {isEdit && (
            <>
              <span className="builder-toolbar-divider" aria-hidden="true" />
              <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/forms/${id}/preview`)}>
                <Eye aria-hidden="true" /> <span className="hide-sm">Preview</span>
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setShareOpen(true)}>
                <Share2 aria-hidden="true" /> <span className="hide-sm">Share</span>
              </button>
            </>
          )}
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || pendingUploads > 0}>
            {saving || pendingUploads > 0
              ? <LoaderCircle className="btn-spinner" aria-hidden="true" />
              : <Save aria-hidden="true" />}
            {saveLabel}
          </button>
        </div>
      </div>

      {/* Form title & description */}
      <div className="builder-header card">
        <input
          className="form-title-input"
          type="text"
          value={form.title}
          onChange={(e) => updateFormField('title', e.target.value)}
          placeholder="Form title"
          aria-label="Form title"
        />
        <textarea
          className="form-desc-input"
          value={form.description}
          onChange={(e) => updateFormField('description', e.target.value)}
          placeholder="Add a description to tell respondents what this form is for (optional)"
          aria-label="Form description"
          rows={2}
        />
        <div className="form-settings">
          <div className="form-settings-text">
            <label className="field-label" htmlFor="form-deadline">Submission deadline</label>
            <p className="field-hint">Leave blank to keep the form open indefinitely.</p>
          </div>
          <div className="form-deadline-controls">
            <input
              id="form-deadline"
              className="input"
              type="datetime-local"
              value={form.deadline || ''}
              onChange={(e) => updateFormField('deadline', e.target.value)}
            />
            {form.deadline && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => updateFormField('deadline', '')}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Sections */}
      <div className="sections-list">
        {form.sections.map((section, si) => (
          <SectionCard
            key={section._key}
            section={section}
            sectionIndex={si}
            sectionCount={form.sections.length}
            canRemove={form.sections.length > 1}
            onChange={updateSection}
            onRemove={removeSection}
            onUploadStateChange={handleUploadStateChange}
          />
        ))}
      </div>

      <button type="button" className="builder-add-section" onClick={addSection}>
        <Plus aria-hidden="true" /> Add Section
      </button>

      </fieldset>

      {shareOpen && <ShareModal form={form} onClose={() => setShareOpen(false)} />}
      {confirmDialog}
      <Toast toast={toast} />
    </div>
  )
}
