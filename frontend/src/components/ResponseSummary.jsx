export default function ResponseSummary({ form, summary, showKeywords = false }) {
  return <div className="summary-view">
    {form.sections.map(section => <div key={section.id}>
      {form.sections.length > 1 && <h2>{section.title}</h2>}
      {section.questions.map(question => {
        const stats = summary.questions[String(question.id)] || {}
        return <div className="summary-card" key={question.id}>
          <div className="summary-question">{question.text}</div>
          {['multiple_choice', 'multiple_select'].includes(question.question_type) ? <>
            {question.choices.map(choice => {
              const count = stats.choice_counts?.[String(choice.id)] || 0
              const base = question.question_type === 'multiple_select' ? summary.count : stats.answered_count
              const percent = base ? Math.round(count / base * 100) : 0
              return <div className="chart-row" key={choice.id}>
                <div className="chart-label" title={choice.text}>{choice.text}</div>
                <div className="chart-bar-container"><div className="chart-bar-fill" style={{ width: `${percent}%` }} /></div>
                <div className="chart-count">{count} ({percent}%)</div>
              </div>
            })}
          </> : question.question_type === 'media' ? <>
            <p>{stats.file_count || 0} files uploaded</p>
            {(stats.files || []).map(file => <div key={file.id}>
              <a href={file.url} target="_blank" rel="noreferrer">{file.url.split('/').pop()}</a>
            </div>)}
            {stats.file_count > 5 && <p className="analytics-footnote">Showing the 5 latest files. Browse individual responses or the spreadsheet for all files.</p>}
          </> : <>
            {(stats.top_answers || []).map(({ text_answer, count }) => <div className="chart-row" key={text_answer}>
              <div className="chart-label analytics-text-label" title={text_answer}>{text_answer}</div>
              <div className="chart-count">{count}</div>
            </div>)}
            {stats.unique_count > 5 && <p className="analytics-footnote">…and {stats.unique_count - 5} more unique answers</p>}
            {showKeywords && !!stats.keywords?.length && <>
              <div className="analytics-subtitle">Top keywords</div>
              {stats.keywords.map(({ text, count }) => <div className="chart-row" key={text}>
                <div className="chart-label">{text}</div><div className="chart-count">{count}</div>
              </div>)}
            </>}
          </>}
          <div className="analytics-footnote">{stats.answered_count || 0} answered responses</div>
        </div>
      })}
    </div>)}
  </div>
}
