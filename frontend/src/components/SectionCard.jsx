import QuestionCard from './QuestionCard'

export default function SectionCard({ section, sectionIndex, onChange, onRemove }) {
  function updateField(field, value) {
    onChange({ ...section, [field]: value })
  }

  function updateQuestion(questionIndex, updatedQuestion) {
    const newQuestions = section.questions.map((q, i) =>
      i === questionIndex ? updatedQuestion : q
    )
    onChange({ ...section, questions: newQuestions })
  }

  function addQuestion() {
    const newQuestion = {
      text: 'Untitled Question',
      question_type: 'short_text',
      required: false,
      order: section.questions.length,
      choices: [],
    }
    onChange({ ...section, questions: [...section.questions, newQuestion] })
  }

  function removeQuestion(questionIndex) {
    const newQuestions = section.questions
      .filter((_, i) => i !== questionIndex)
      .map((q, i) => ({ ...q, order: i }))
    onChange({ ...section, questions: newQuestions })
  }

  return (
    <div className="section-card">
      <div className="section-header">
        <div className="section-number">{sectionIndex + 1}</div>
        <input
          type="text"
          value={section.title}
          onChange={(e) => updateField('title', e.target.value)}
          placeholder="Section title"
        />
        <div className="section-actions">
          <button className="btn btn-icon btn-danger" onClick={onRemove} title="Delete section">
            🗑
          </button>
        </div>
      </div>

      <div className="section-desc">
        <input
          type="text"
          value={section.description}
          onChange={(e) => updateField('description', e.target.value)}
          placeholder="Section description (optional)"
        />
      </div>

      <div className="section-body">
        {section.questions.map((question, qi) => (
          <QuestionCard
            key={qi}
            question={question}
            questionIndex={qi}
            onChange={(updated) => updateQuestion(qi, updated)}
            onRemove={() => removeQuestion(qi)}
          />
        ))}

        <div className="section-add-question">
          <button className="btn btn-secondary" onClick={addQuestion}>
            + Add Question
          </button>
        </div>
      </div>
    </div>
  )
}
