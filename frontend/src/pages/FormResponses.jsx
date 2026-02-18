import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getForm, getFormResponses, exportFormResponses } from '../api'

export default function FormResponses() {
  const { id } = useParams()
  const [form, setForm] = useState(null)
  const [responses, setResponses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('summary')

  useEffect(() => {
    loadData()
  }, [id])

  async function loadData() {
    try {
      const [formData, responsesData] = await Promise.all([
        getForm(id),
        getFormResponses(id)
      ])
      setForm(formData.data)
      setResponses(responsesData.data)
    } catch (err) {
      setError('Failed to load data.')
    } finally {
      setLoading(false)
    }
  }

  async function handleExportCSV() {
    try {
      const response = await exportFormResponses(id)
      
      // Create a blob link to download
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `${form.title}_responses.csv`)
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (err) {
      console.error('Failed to export CSV', err)
      alert('Failed to export CSV')
    }
  }

  if (loading) return <div className="loading"><div className="spinner" /></div>
  if (error) return <div className="empty-state"><h2>{error}</h2></div>

  // Create lookup for questions
  const questionsMap = {}
  const choicesMap = {}
  form.sections.forEach(s => {
    s.questions.forEach(q => {
      questionsMap[q.id] = q
      q.choices.forEach(c => {
        choicesMap[c.id] = c.text
      })
    })
  })

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
           <h1>Responses: {form.title}</h1>
           <span className="form-count">{responses.length} response{responses.length !== 1 ? 's' : ''}</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => window.open(`/forms/${id}/responses/analytics`, '_blank', 'noopener,noreferrer')}
            className="btn btn-primary"
          >
            📊 View Analytics
          </button>
          <button onClick={handleExportCSV} className="btn btn-secondary">
            ⬇ Export CSV
          </button>
          <Link to={`/forms/${id}/edit`} className="btn btn-secondary">
            ← Back to Editor
          </Link>
        </div>
      </div>

      <div className="tabs">
        <button 
          className={`tab-btn ${activeTab === 'summary' ? 'active' : ''}`}
          onClick={() => setActiveTab('summary')}
        >
          Summary
        </button>
        <button 
          className={`tab-btn ${activeTab === 'individual' ? 'active' : ''}`}
          onClick={() => setActiveTab('individual')}
        >
          Individual
        </button>
      </div>

      {responses.length === 0 ? (
        <div className="empty-state">
           <div className="empty-icon">📭</div>
           <h2>No responses yet</h2>
           <p>Share your form link to get started!</p>
        </div>
      ) : activeTab === 'summary' ? (
        <SummaryView 
          form={form} 
          responses={responses} 
          choicesMap={choicesMap} 
        />
      ) : (
        <IndividualView 
          responses={responses} 
          questionsMap={questionsMap} 
          choicesMap={choicesMap} 
        />
      )}
    </div>
  )
}

function SummaryView({ form, responses, choicesMap }) {
  return (
    <div className="summary-view">
      {form.sections.map(section => (
        <div key={section.id}>
          {form.sections.length > 1 && <h2 style={{ marginBottom: '16px' }}>{section.title}</h2>}
          
          {section.questions.map(question => (
            <SummaryQuestion 
              key={question.id} 
              question={question} 
              responses={responses} 
              choicesMap={choicesMap} 
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function SummaryQuestion({ question, responses, choicesMap }) {
  // Aggregate data
  const answers = responses.flatMap(r => 
    r.answers.filter(a => a.question === question.id)
  )

  return (
    <div className="summary-card">
      <div className="summary-question">{question.text}</div>
      <div className="summary-stats">
        {question.question_type === 'multiple_choice' || question.question_type === 'multiple_select' ? (
          <ChoiceStats 
            question={question} 
            answers={answers} 
            choicesMap={choicesMap} 
            totalResponses={responses.length}
          />
        ) : question.question_type === 'media' ? (
          <FileStats answers={answers} />
        ) : (
          <TextStats answers={answers} totalResponses={responses.length} />
        )}
      </div>
    </div>
  )
}

function FileStats({ answers }) {
  const fileAnswers = answers.filter(a => a.file_answer)
  
  return (
    <div>
      <div style={{ marginBottom: '12px', fontStyle: 'italic', color: 'var(--text-secondary)' }}>
        {fileAnswers.length} file{fileAnswers.length !== 1 ? 's' : ''} uploaded
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {fileAnswers.map(answer => (
          <div key={answer.id} className="chart-row">
            <a 
              href={answer.file_answer} 
              target="_blank" 
              rel="noopener noreferrer"
              style={{ color: 'var(--primary)', textDecoration: 'underline', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {answer.file_answer.split('/').pop()}
            </a>
          </div>
        ))}
      </div>
    </div>
  )
}

function ChoiceStats({ question, answers, choicesMap, totalResponses }) {
  const counts = {}
  question.choices.forEach(c => counts[c.id] = 0)
  
  answers.forEach(a => {
    const selectedChoices = Array.isArray(a.selected_choices) ? a.selected_choices : []
    selectedChoices.forEach(cId => {
      counts[cId] = (counts[cId] || 0) + 1
    })
  })

  const validAnswers = answers.filter(a => Array.isArray(a.selected_choices) && a.selected_choices.length > 0).length

  return (
    <div>
      {question.choices.map(choice => {
        const count = counts[choice.id] || 0
        const displayPercent = validAnswers > 0 ? Math.round((count / validAnswers) * 100) : 0
        
        return (
          <div key={choice.id} className="chart-row">
            <div className="chart-label" title={choice.text}>{choice.text}</div>
            <div className="chart-bar-container">
              <div 
                className="chart-bar-fill" 
                style={{ width: `${displayPercent}%` }}
              />
            </div>
            <div className="chart-count">
              {count}{validAnswers > 0 ? ` (${displayPercent}%)` : ''}
            </div>
          </div>
        )
      })}
      <div style={{ marginTop: '12px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
        {validAnswers} response{validAnswers !== 1 ? 's' : ''}
      </div>
    </div>
  )
}

function TextStats({ answers, totalResponses }) {
  // Group by text value
  const groups = {}
  answers.forEach(a => {
    const text = a.text_answer || '(No answer)'
    groups[text] = (groups[text] || 0) + 1
  })
  
  const sortedGroups = Object.entries(groups).sort((a, b) => b[1] - a[1])
  
  return (
    <div>
      {sortedGroups.slice(0, 5).map(([text, count], i) => (
        <div key={i} className="chart-row">
          <div className="chart-label" style={{ width: 'auto', flex: 1 }}>"{text}"</div>
          <div style={{ fontWeight: 500 }}>{count}</div>
        </div>
      ))}
      {sortedGroups.length > 5 && (
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
          ...and {sortedGroups.length - 5} more unique answers
        </div>
      )}
      <div style={{ marginTop: '12px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
        {answers.length} responses
      </div>
    </div>
  )
}

function IndividualView({ responses, questionsMap, choicesMap }) {
  const [index, setIndex] = useState(0)
  
  // Sort responses by date desc? They come from API desc.
  const response = responses[index]
  const total = responses.length

  function prev() {
    setIndex(i => Math.max(0, i - 1))
  }

  function next() {
    setIndex(i => Math.min(total - 1, i + 1))
  }

  return (
    <div className="individual-view">
      <div className="pagination-controls">
         <button className="btn btn-secondary" onClick={prev} disabled={index === 0}>
           ← Previous
         </button>
         <div className="response-counter">
           {index + 1} of {total}
         </div>
         <button className="btn btn-secondary" onClick={next} disabled={index === total - 1}>
           Next →
         </button>
      </div>

      <div className="form-card" style={{ cursor: 'default' }}>
         <div className="form-card-title">
            Submission at {new Date(response.created_at).toLocaleString()}
         </div>
         
         <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
           {response.answers.map(answer => {
             const question = questionsMap[answer.question]
             if (!question) return null
             
             let displayAnswer = answer.text_answer
             
             if (question.question_type === 'multiple_choice' || question.question_type === 'multiple_select') {
                displayAnswer = answer.selected_choices
                  .map(choiceId => choicesMap[choiceId] || '?')
                  .join(', ')
             } else if (question.question_type === 'media' && answer.file_answer) {
                displayAnswer = (
                  <a href={answer.file_answer} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>
                    View File 
                  </a>
                )
             }

             return (
               <div key={answer.id}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    {question.text}
                  </div>
                  <div style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                    {displayAnswer || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No answer</span>}
                  </div>
               </div>
             )
           })}
         </div>
      </div>
    </div>
  )
}
