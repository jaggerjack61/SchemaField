import { useState, useRef, memo } from 'react'
import { AlignLeft, CircleAlert, Hash, ImagePlus, LoaderCircle, Paperclip, Sigma, Trash2, Type, X } from 'lucide-react'
import { uploadQuestionMedia } from '../api'
import { MEDIA_ACCEPT, getMediaType, mediaFileError } from '../media'
import { clientKey } from '../formBuilderState'

const CHOICE_TYPES = ['multiple_choice', 'multiple_select']

// What the respondent will see for answer types that have no options to edit.
const TYPE_PREVIEWS = {
  short_text: { icon: Type, text: 'Short answer text' },
  long_text: { icon: AlignLeft, text: 'Long answer text' },
  number: { icon: Hash, text: 'Whole number' },
  float: { icon: Sigma, text: 'Decimal number' },
  media: { icon: Paperclip, text: 'File upload (image, video, audio or document)' },
}

function QuestionCard({ question, onChange, onRemove, onUploadStateChange, questionIndex }) {
  const questionKey = question._key
  const needsChoices = CHOICE_TYPES.includes(question.question_type)
  const mediaInputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  // All edits go through functional updates on the current question, so an
  // upload that finishes later cannot overwrite changes made in the meantime.
  function update(updater) {
    onChange(questionKey, updater)
  }

  function updateField(field, value) {
    update(current => ({ ...current, [field]: value }))
  }

  function updateChoice(choiceKey, text) {
    update(current => ({
      ...current,
      choices: current.choices.map(c => (c._key === choiceKey ? { ...c, text } : c)),
    }))
  }

  function addChoice() {
    update(current => ({
      ...current,
      choices: [...current.choices, { _key: clientKey(), text: `Option ${current.choices.length + 1}` }],
    }))
  }

  function removeChoice(choiceKey) {
    update(current => ({ ...current, choices: current.choices.filter(c => c._key !== choiceKey) }))
  }

  function changeType(newType) {
    update(current => ({
      ...current,
      question_type: newType,
      choices: CHOICE_TYPES.includes(newType)
        ? (current.choices.length > 0 ? current.choices : [{ _key: clientKey(), text: 'Option 1' }])
        : [],
    }))
  }

  async function handleMediaUpload(e) {
    const file = e.target.files?.[0]
    // Allow picking the same file again after an error.
    e.target.value = ''
    if (!file) return
    const error = mediaFileError(file)
    if (error) {
      setUploadError(error)
      return
    }
    setUploadError('')
    setUploading(true)
    onUploadStateChange(1)
    try {
      const { data } = await uploadQuestionMedia(file)
      update(current => ({ ...current, media_file: data.path, media_url: data.url }))
    } catch (err) {
      setUploadError(err.response?.data?.detail || 'Upload failed. Please try again.')
    } finally {
      setUploading(false)
      onUploadStateChange(-1)
    }
  }

  function removeMedia() {
    update(current => ({ ...current, media_file: '', media_url: null }))
  }


  const mediaUrl = question.media_url || (question.media_file ? `/media/${question.media_file}` : null)
  const mediaType = getMediaType(mediaUrl)

  const typePreview = TYPE_PREVIEWS[question.question_type]

  return (
    <div className="question-card">
      <div className="question-top-row">
        <span className="question-index" aria-hidden="true">{questionIndex + 1}</span>
        <input
          className="input question-text-input"
          type="text"
          value={question.text}
          onChange={(e) => updateField('text', e.target.value)}
          placeholder="Question text"
          aria-label={`Question ${questionIndex + 1} text`}
        />
        <select
          className="select question-type-select"
          value={question.question_type}
          onChange={(e) => changeType(e.target.value)}
          aria-label={`Question ${questionIndex + 1} type`}
        >
          <option value="short_text">Short text</option>
          <option value="long_text">Long text</option>
          <option value="number">Number</option>
          <option value="float">Decimal</option>
          <option value="multiple_choice">Multiple choice</option>
          <option value="multiple_select">Multiple select</option>
          <option value="media">File upload</option>
        </select>
      </div>

      <div className="question-content">
        {/* Media attachment area */}
        {mediaUrl && (
          <div className="question-media-preview">
            {mediaType === 'image' && <img src={mediaUrl} alt="Question attachment" />}
            {mediaType === 'video' && <video src={mediaUrl} controls />}
            {mediaType === 'audio' && <audio src={mediaUrl} controls />}
            {!mediaType && (
              <div className="question-media-file">
                <Paperclip size={14} aria-hidden="true" />
                {question.media_file?.split('/').pop()}
              </div>
            )}
            <button
              className="btn btn-secondary btn-sm question-media-remove"
              onClick={removeMedia}
              aria-label="Remove attachment"
              title="Remove attachment"
            >
              <X aria-hidden="true" /> Remove
            </button>
          </div>
        )}

        {/* Choices editor for MC / MS */}
        {needsChoices && (
          <div className="choices-list">
            {question.choices.map((choice, ci) => (
              <div className="choice-row" key={choice._key}>
                <span
                  className={`choice-indicator ${question.question_type === 'multiple_select' ? 'square' : ''}`}
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={choice.text}
                  onChange={(e) => updateChoice(choice._key, e.target.value)}
                  placeholder={`Option ${ci + 1}`}
                  aria-label={`Option ${ci + 1}`}
                />
                {question.choices.length > 1 && (
                  <button
                    className="btn btn-ghost-danger btn-sm btn-icon"
                    onClick={() => removeChoice(choice._key)}
                    aria-label={`Remove option ${ci + 1}`}
                    title="Remove option"
                  >
                    <X aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
            <button className="add-choice-btn" onClick={addChoice}>
              <span className={`choice-indicator ${question.question_type === 'multiple_select' ? 'square' : ''}`} aria-hidden="true" />
              Add option
            </button>
          </div>
        )}

        {/* Type preview for non-choice types */}
        {!needsChoices && typePreview && (
          <div className="question-type-preview">
            <typePreview.icon size={14} aria-hidden="true" />
            {typePreview.text}
          </div>
        )}

        {uploadError && (
          <div className="field-error question-media-error" role="alert">
            <CircleAlert aria-hidden="true" />
            {uploadError}
          </div>
        )}
      </div>

      <div className="question-bottom-row">
        <div className="question-media-upload">
          {!mediaUrl && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => mediaInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading
                ? <LoaderCircle className="btn-spinner" aria-hidden="true" />
                : <ImagePlus aria-hidden="true" />}
              {uploading ? 'Uploading…' : 'Attach media'}
            </button>
          )}
          <input
            ref={mediaInputRef}
            type="file"
            accept={MEDIA_ACCEPT}
            onChange={handleMediaUpload}
            hidden
          />
        </div>
        <div className="question-actions">
          <label className="switch">
            <input
              type="checkbox"
              checked={question.required}
              onChange={(e) => updateField('required', e.target.checked)}
            />
            Required
          </label>
          <span className="question-actions-divider" aria-hidden="true" />
          <button
            className="btn btn-ghost-danger btn-sm btn-icon"
            onClick={() => onRemove(questionKey)}
            aria-label="Delete question"
            title="Delete question"
          >
            <Trash2 aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default memo(QuestionCard)
