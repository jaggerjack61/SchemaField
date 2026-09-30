import { CircleAlert } from 'lucide-react'
import { MEDIA_ACCEPT, getMediaType } from '../media'

const CHOICE_TYPES = ['multiple_choice', 'multiple_select']

export function QuestionMedia({ question }) {
  const mediaUrl = question.media_url || (question.media_file ? `/media/${question.media_file}` : null)
  const mediaType = getMediaType(mediaUrl)
  if (!mediaUrl || !mediaType) return null

  return (
    <div className="form-question-media">
      {mediaType === 'image' && <img src={mediaUrl} alt="" />}
      {mediaType === 'video' && <video src={mediaUrl} controls />}
      {mediaType === 'audio' && <audio src={mediaUrl} controls />}
    </div>
  )
}

/**
 * One question as a respondent sees it. With `readOnly` the inputs are inert
 * (used by the owner's preview); otherwise the callbacks receive the answer.
 */
export default function FormQuestion({
  question,
  index,
  value,
  error,
  readOnly = false,
  onChange,
  onBlur,
  onToggleChoice,
  onFile,
}) {
  const key = question.id ?? `preview-${index}`
  const inputId = `q-${key}`
  const labelId = `q-${key}-label`
  const errorId = `q-${key}-error`
  const isChoice = CHOICE_TYPES.includes(question.question_type)
  const describedBy = error ? errorId : undefined

  const label = (
    <>
      {question.text}
      {question.required && <span className="required-star" aria-label="required">*</span>}
    </>
  )

  function renderInput() {
    switch (question.question_type) {
      case 'short_text':
      case 'number':
      case 'float':
        return (
          <input
            id={inputId}
            className="input"
            type={question.question_type === 'short_text' ? 'text' : 'number'}
            inputMode={question.question_type === 'number' ? 'numeric' : question.question_type === 'float' ? 'decimal' : undefined}
            step={question.question_type === 'float' ? 'any' : question.question_type === 'number' ? '1' : undefined}
            required={question.required}
            readOnly={readOnly}
            value={readOnly ? undefined : value || ''}
            onChange={readOnly ? undefined : e => onChange(e.target.value)}
            onBlur={readOnly ? undefined : e => onBlur?.(e.target.value)}
            placeholder={question.question_type === 'short_text' ? 'Your answer' : question.question_type === 'float' ? '0.00' : '0'}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={describedBy}
          />
        )
      case 'long_text':
        return (
          <textarea
            id={inputId}
            className="textarea"
            required={question.required}
            readOnly={readOnly}
            value={readOnly ? undefined : value || ''}
            onChange={readOnly ? undefined : e => onChange(e.target.value)}
            onBlur={readOnly ? undefined : e => onBlur?.(e.target.value)}
            placeholder="Your answer"
            rows={4}
          />
        )
      case 'multiple_choice':
      case 'multiple_select': {
        const single = question.question_type === 'multiple_choice'
        const selected = value || []
        return (
          <div className="choice-list">
            {question.choices.map((choice, ci) => (
              <label className="choice-option" key={choice.id ?? ci}>
                <input
                  type={single ? 'radio' : 'checkbox'}
                  name={`q-${key}`}
                  disabled={readOnly}
                  required={!readOnly && question.required && selected.length === 0}
                  checked={readOnly ? undefined : selected.includes(choice.id)}
                  onChange={readOnly ? undefined : () => onToggleChoice(choice.id)}
                />
                <span>{choice.text}</span>
              </label>
            ))}
          </div>
        )
      }
      case 'media':
        return (
          <input
            id={inputId}
            className="file-input"
            type="file"
            required={question.required}
            disabled={readOnly}
            accept={MEDIA_ACCEPT}
            onChange={readOnly ? undefined : e => onFile(e.target.files[0], e.target)}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={describedBy}
          />
        )
      default:
        return null
    }
  }

  return (
    <div
      className="form-question"
      role={isChoice ? 'group' : undefined}
      aria-labelledby={isChoice ? labelId : undefined}
    >
      {isChoice ? (
        <div className="form-question-label" id={labelId}>{label}</div>
      ) : (
        <label className="form-question-label" id={labelId} htmlFor={inputId}>{label}</label>
      )}
      {question.question_type === 'multiple_select' && (
        <div className="form-question-hint">Select all that apply</div>
      )}
      <QuestionMedia question={question} />
      {renderInput()}
      {error && (
        <div className="field-error" id={errorId}>
          <CircleAlert aria-hidden="true" />
          {error}
        </div>
      )}
    </div>
  )
}
