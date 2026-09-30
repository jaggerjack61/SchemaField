import { Paperclip } from 'lucide-react'

const TYPE_LABELS = {
  short_text: 'Short text',
  long_text: 'Long text',
  number: 'Number',
  float: 'Decimal',
  multiple_choice: 'Multiple choice',
  multiple_select: 'Multiple select',
  media: 'File upload',
}

export default function ResponseSummary({ form, summary, showKeywords = false }) {
  return <div className="summary-view">
    {form.sections.map(section => <div key={section.id} className="summary-section">
      {form.sections.length > 1 && <h2 className="summary-section-title">{section.title}</h2>}
      {section.questions.map(question => {
        const stats = summary.questions[String(question.id)] || {}
        return <div className="card summary-card" key={question.id}>
          <div className="summary-card-head">
            <div className="summary-question">{question.text}</div>
            <span className="badge">{TYPE_LABELS[question.question_type] || question.question_type}</span>
          </div>
          <div className="summary-card-sub">{stats.answered_count || 0} answered</div>

          {['multiple_choice', 'multiple_select'].includes(question.question_type) ? <div className="chart-rows">
            {question.choices.map(choice => {
              const count = stats.choice_counts?.[String(choice.id)] || 0
              const base = question.question_type === 'multiple_select' ? summary.count : stats.answered_count
              const percent = base ? Math.round(count / base * 100) : 0
              return <div className="chart-row" key={choice.id} title={`${choice.text}: ${count} (${percent}%)`}>
                <div className="chart-label">{choice.text}</div>
                <div className="chart-bar-container"><div className="chart-bar-fill" style={{ width: `${percent}%` }} /></div>
                <div className="chart-count"><strong>{percent}%</strong> <span>{count}</span></div>
              </div>
            })}
          </div> : question.question_type === 'media' ? <>
            <p className="summary-stat-line">{stats.file_count || 0} file{stats.file_count === 1 ? '' : 's'} uploaded</p>
            {!!stats.files?.length && <ul className="summary-files">
              {stats.files.map(file => <li key={file.id}>
                <Paperclip size={14} aria-hidden="true" />
                <a href={file.url} target="_blank" rel="noreferrer">{file.url.split('/').pop()}</a>
              </li>)}
            </ul>}
            {stats.file_count > 5 && <p className="analytics-footnote">Showing the 5 latest files. Browse individual responses or the spreadsheet for all files.</p>}
          </> : <>
            {stats.top_answers?.length ? <>
              <div className="analytics-subtitle">Most common answers</div>
              <ol className="summary-answers">
                {stats.top_answers.map(({ text_answer, count }) => <li key={text_answer}>
                  <span className="summary-answer-text" title={text_answer}>{text_answer}</span>
                  <span className="summary-answer-count">{count}</span>
                </li>)}
              </ol>
            </> : <p className="summary-stat-line">No answers yet.</p>}
            {stats.unique_count > 5 && <p className="analytics-footnote">…and {stats.unique_count - 5} more unique answers</p>}
            {showKeywords && !!stats.keywords?.length && <>
              <div className="analytics-subtitle">Top keywords</div>
              <div className="summary-keywords">
                {stats.keywords.map(({ text, count }) => <span className="badge" key={text}>
                  {text} <span className="summary-keyword-count">{count}</span>
                </span>)}
              </div>
            </>}
          </>}
        </div>
      })}
    </div>)}
  </div>
}
