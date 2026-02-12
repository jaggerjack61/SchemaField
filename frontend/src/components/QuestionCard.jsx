export default function QuestionCard({ question, onChange, onRemove, questionIndex }) {
  const needsChoices = question.question_type === 'multiple_choice' || question.question_type === 'multiple_select'

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
