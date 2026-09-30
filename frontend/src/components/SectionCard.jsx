import { memo, useCallback } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import QuestionCard from './QuestionCard'
import { newQuestion } from '../formBuilderState'

function SectionCard({ section, sectionIndex, sectionCount, canRemove, onChange, onRemove, onUploadStateChange }) {
  const sectionKey = section._key

  // Stable callbacks keep memoized QuestionCards from re-rendering on every
  // keystroke elsewhere in the form.
  const updateQuestion = useCallback((questionKey, update) => {
    onChange(sectionKey, current => ({
      ...current,
      questions: current.questions.map(q => (q._key === questionKey ? update(q) : q)),
    }))
  }, [onChange, sectionKey])

  const removeQuestion = useCallback((questionKey) => {
    onChange(sectionKey, current => ({
      ...current,
      questions: current.questions.filter(q => q._key !== questionKey),
    }))
  }, [onChange, sectionKey])

  function updateField(field, value) {
    onChange(sectionKey, current => ({ ...current, [field]: value }))
  }

  function addQuestion() {
    onChange(sectionKey, current => ({ ...current, questions: [...current.questions, newQuestion()] }))
  }

  return (
    <section className="section-card card" aria-label={`Section ${sectionIndex + 1}`}>
      <div className="section-header">
        <span className="section-number">
          Section {sectionIndex + 1}<span className="section-number-of"> of {sectionCount}</span>
        </span>
        <button
          className="btn btn-ghost-danger btn-sm btn-icon"
          onClick={() => onRemove(sectionKey, section.questions.length)}
          disabled={!canRemove}
          aria-label="Delete section"
          title={canRemove ? 'Delete section' : 'A form must have at least one section'}
        >
          <Trash2 aria-hidden="true" />
        </button>
      </div>

      <div className="section-fields">
        <input
          className="section-title-input"
          type="text"
          value={section.title}
          onChange={(e) => updateField('title', e.target.value)}
          placeholder="Section title"
          aria-label="Section title"
        />
        <input
          className="section-desc-input"
          type="text"
          value={section.description}
          onChange={(e) => updateField('description', e.target.value)}
          placeholder="Section description (optional)"
          aria-label="Section description"
        />
      </div>

      <div className="section-body">
        {section.questions.length === 0 && (
          <p className="section-empty">No questions in this section yet.</p>
        )}
        {section.questions.map((question, qi) => (
          <QuestionCard
            key={question._key}
            question={question}
            questionIndex={qi}
            onChange={updateQuestion}
            onRemove={removeQuestion}
            onUploadStateChange={onUploadStateChange}
          />
        ))}

        <button type="button" className="section-add-question" onClick={addQuestion}>
          <Plus aria-hidden="true" /> Add Question
        </button>
      </div>
    </section>
  )
}

export default memo(SectionCard)
