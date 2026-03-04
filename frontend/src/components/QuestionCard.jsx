import { useState, useRef } from 'react'
import { uploadQuestionMedia } from '../api'

function getMediaType(url) {
  if (!url) return null
  const ext = url.split('.').pop().split('?')[0].toLowerCase()
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return 'image'
  if (['mp4', 'webm', 'ogg'].includes(ext)) return 'video'
  if (['mp3', 'wav', 'ogg', 'webm', 'm4a'].includes(ext)) return 'audio'
  return null
}

export default function QuestionCard({ question, onChange, onRemove, questionIndex }) {
  const needsChoices = question.question_type === 'multiple_choice' || question.question_type === 'multiple_select'
  const mediaInputRef = useRef(null)
  const [uploading, setUploading] = useState(false)

  function updateField(field, value) {
    onChange({ ...question, [field]: value })
  }

  function updateChoice(choiceIndex, text) {
    const newChoices = question.choices.map((c, i) =>
      i === choiceIndex ? { ...c, text } : c
    )
    onChange({ ...question, choices: newChoices })
  }

  function addChoice() {
    const newChoices = [
      ...question.choices,
      { text: `Option ${question.choices.length + 1}`, order: question.choices.length },
    ]
    onChange({ ...question, choices: newChoices })
  }

  function removeChoice(choiceIndex) {
    const newChoices = question.choices
      .filter((_, i) => i !== choiceIndex)
      .map((c, i) => ({ ...c, order: i }))
    onChange({ ...question, choices: newChoices })
  }

  async function handleMediaUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const { data } = await uploadQuestionMedia(file)
      onChange({ ...question, media_file: data.path, media_url: data.url })
    } catch (err) {
      console.error('Failed to upload media', err)
    } finally {
      setUploading(false)
    }
  }

  function removeMedia() {
    onChange({ ...question, media_file: '', media_url: null })
  }

  function getTypePreviewText() {
    switch (question.question_type) {
      case 'short_text': return '📝 Short text answer'
      case 'long_text': return '📄 Long text answer'
      case 'number': return '🔢 Integer number'
      case 'float': return '🔢 Decimal number'
      case 'media': return '📎 File upload'
      default: return ''
    }
  }

  const mediaUrl = question.media_url || (question.media_file ? `/media/${question.media_file}` : null)
  const mediaType = getMediaType(mediaUrl)

  return (
    <div className="question-card">
      <div className="question-top-row">
        <input
          type="text"
          value={question.text}
          onChange={(e) => updateField('text', e.target.value)}
          placeholder="Question text"
        />
        <select
          value={question.question_type}
          onChange={(e) => {
            const newType = e.target.value
            const choices =
              newType === 'multiple_choice' || newType === 'multiple_select'
                ? question.choices.length > 0
                  ? question.choices
                  : [{ text: 'Option 1', order: 0 }]
                : []
            onChange({ ...question, question_type: newType, choices })
          }}
        >
          <option value="short_text">Short Text</option>
          <option value="long_text">Long Text</option>
          <option value="number">Number</option>
          <option value="float">Float</option>
          <option value="multiple_choice">Multiple Choice</option>
          <option value="multiple_select">Multiple Select</option>
          <option value="media">Media</option>
        </select>
      </div>

      {/* Media attachment area */}
      <div className="question-media-section">
        {mediaUrl ? (
          <div className="question-media-preview">
            {mediaType === 'image' && (
              <img src={mediaUrl} alt="Question media" style={{ maxWidth: '100%', maxHeight: '240px', borderRadius: '8px' }} />
            )}
            {mediaType === 'video' && (
              <video src={mediaUrl} controls style={{ maxWidth: '100%', maxHeight: '240px', borderRadius: '8px' }} />
            )}
            {mediaType === 'audio' && (
              <audio src={mediaUrl} controls style={{ width: '100%' }} />
            )}
            {!mediaType && (
              <div style={{ padding: '12px', background: 'var(--surface-2, #2a2a3d)', borderRadius: '8px', fontSize: '0.85rem' }}>
                📎 Attached file: {question.media_file?.split('/').pop()}
              </div>
            )}
            <button
              className="btn btn-danger"
              onClick={removeMedia}
              title="Remove media"
              style={{ marginTop: '6px', fontSize: '0.8rem', padding: '4px 12px' }}
            >
              ✕ Remove
            </button>
          </div>
        ) : (
          <div className="question-media-upload">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => mediaInputRef.current?.click()}
              disabled={uploading}
              style={{ fontSize: '0.8rem', padding: '4px 10px' }}
            >
              {uploading ? '⏳ Uploading…' : '📷 Attach Media'}
            </button>
            <input
              ref={mediaInputRef}
              type="file"
              accept="image/*,video/*,audio/*"
              onChange={handleMediaUpload}
              style={{ display: 'none' }}
            />
          </div>
        )}
      </div>

      {/* Choices editor for MC / MS */}
      {needsChoices && (
        <div className="choices-list">
          {question.choices.map((choice, ci) => (
            <div className="choice-row" key={ci}>
              <div
                className={`choice-indicator ${question.question_type === 'multiple_select' ? 'square' : ''}`}
              />
              <input
                type="text"
                value={choice.text}
                onChange={(e) => updateChoice(ci, e.target.value)}
                placeholder={`Option ${ci + 1}`}
              />
              {question.choices.length > 1 && (
                <button
                  className="btn btn-icon btn-danger"
                  onClick={() => removeChoice(ci)}
                  title="Remove option"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <button className="add-choice-btn" onClick={addChoice}>
            + Add option
          </button>
        </div>
      )}

      {/* Type preview for non-choice types */}
      {!needsChoices && (
        <div className="question-type-preview">{getTypePreviewText()}</div>
      )}

      <div className="question-bottom-row">
        <label>
          <input
            type="checkbox"
            checked={question.required}
            onChange={(e) => updateField('required', e.target.checked)}
          />
          Required
        </label>
        <div className="question-actions">
          <button className="btn btn-icon btn-danger" onClick={onRemove} title="Delete question">
            🗑
          </button>
        </div>
      </div>
    </div>
  )
}
