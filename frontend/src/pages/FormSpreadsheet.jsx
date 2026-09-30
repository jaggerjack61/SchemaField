import { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowDown, ArrowUp, ChartColumn, ChevronsUpDown, Download, FileX, Inbox, Paperclip } from 'lucide-react'
import { getForm, getFormResponses, exportFormResponses } from '../api'

import Pagination from '../components/Pagination'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import Toast, { useToast } from '../components/Toast'

const DEFAULT_SORT = { key: 'submittedAt', direction: 'desc' }

export default function FormSpreadsheet() {
  const { id } = useParams()
  const [form, setForm] = useState(null)
  const [responses, setResponses] = useState(null)
  const [page, setPage] = useState(1)
  const [count, setCount] = useState(0)
  const [pageLoading, setPageLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sort, setSort] = useState(DEFAULT_SORT)
  const scrollRef = useRef(null)
  const [fillerRowCount, setFillerRowCount] = useState(0)
  const [fillerRemainder, setFillerRemainder] = useState(0)
  const [dataRowHeight, setDataRowHeight] = useState(0)
  const [toast, showToast] = useToast()

  // The form definition doesn't change with paging or sorting; load it once.
  useEffect(() => {
    let cancelled = false
    setForm(null)
    getForm(id)
      .then(({ data }) => { if (!cancelled) setForm(data) })
      .catch(() => { if (!cancelled) setError('Failed to load data.') })
    return () => { cancelled = true }
  }, [id])

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    setPageLoading(true)
    getFormResponses(id, { page, page_size: 50, sort: sort.key, direction: sort.direction }, controller.signal)
      .then(({ data }) => {
        if (cancelled) return
        setResponses(data.results)
        setCount(data.count ?? data.results.length)
      })
      .catch(() => { if (!cancelled) setError('Failed to load data.') })
      .finally(() => { if (!cancelled) setPageLoading(false) })
    return () => { cancelled = true; controller.abort() }
  }, [id, page, sort])

  // Only the first load replaces the page with a spinner; later pages and
  // sorts keep the current table on screen while they load.
  const loading = !error && (!form || responses === null)

  const { columns, rows } = useMemo(() => {
    if (!form || !responses) return { columns: [], rows: [] }

    const questions = []
    form.sections.forEach((section) => {
      section.questions.forEach((q) => questions.push(q))
    })

    const cols = [
      { key: 'id', label: 'Response ID', width: 130, sortable: true },
      { key: 'submittedAt', label: 'Submitted At', width: 170, sortable: true },
      ...questions.map((q) => ({
        key: q.id,
        label: q.text,
        width: 220,
        sortable: true,
        question: q,
      })),
    ]

    const answerRows = responses.map((r) => {
      const answersMap = {}
      r.answers.forEach((a) => {
        answersMap[a.question] = a
      })

      const row = { id: r.id, submittedAt: r.created_at }
      questions.forEach((q) => {
        const answer = answersMap[q.id]
        row[q.id] = formatSortableAnswer(answer, q)
        row[`__isMedia_${q.id}`] = q.question_type === 'media' && answer?.file_answer
      })
      return row
    })

    return { columns: cols, rows: answerRows }
  }, [form, responses])

  // The server sorts the entire history before selecting this page.
  const sortedRows = rows

  useLayoutEffect(() => {
    function updateFillerRows() {
      const scrollEl = scrollRef.current
      if (!scrollEl) return
      const tableEl = scrollEl.querySelector('table')
      if (!tableEl) return

      const dataRowEl = tableEl.querySelector('tbody tr:not(.spreadsheet-filler-row)')
      if (!dataRowEl) return

      const existingFillers = tableEl.querySelectorAll('tbody tr.spreadsheet-filler-row')
      const existingFillerHeight = Array.from(existingFillers).reduce(
        (sum, row) => sum + row.offsetHeight,
        0
      )

      const usedHeight = tableEl.offsetHeight - existingFillerHeight
      const availableHeight = scrollEl.clientHeight
      const emptySpace = Math.max(0, availableHeight - usedHeight)
      const rowHeight = dataRowEl.offsetHeight
      if (rowHeight > 0) {
        const fullRows = Math.floor(emptySpace / rowHeight)
        const remainder = emptySpace - fullRows * rowHeight
        setFillerRowCount(fullRows)
        setFillerRemainder(remainder)
        setDataRowHeight(rowHeight)
      } else {
        setFillerRowCount(0)
        setFillerRemainder(0)
        setDataRowHeight(0)
      }
    }

    // Measure at most once per frame while the window is being resized.
    let frame = 0
    function handleResize() {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(updateFillerRows)
    }

    updateFillerRows()
    window.addEventListener('resize', handleResize)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', handleResize)
    }
  }, [sortedRows, loading])

  function handleSort(key) {
    setPage(1)
    setSort((current) => {
      if (current.key !== key) return { key, direction: 'asc' }
      if (current.direction === 'asc') return { key, direction: 'desc' }
      // Response ID and Submitted At always have a meaningful order, so they
      // just toggle. Question columns return to the default order.
      if (key === 'id' || key === 'submittedAt') return { key, direction: 'asc' }
      return DEFAULT_SORT
    })
  }

  async function handleExportCSV() {
    try {
      const response = await exportFormResponses(id)
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `${form.title}_responses.csv`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to export CSV', err)
      showToast('Failed to export CSV', 'error')
    }
  }

  if (loading) return <div className="loading"><div className="spinner" /></div>
  if (error) return <EmptyState icon={FileX} title="Couldn’t load responses" description={error} />

  return (
    <div className="spreadsheet-page">
      <div className="spreadsheet-header">
        <PageHeader
          back={{ to: `/forms/${id}/responses`, label: 'Responses' }}
          title={form.title}
          subtitle={`${count} response${count !== 1 ? 's' : ''}`}
          actions={
            <>
              <Link to={`/forms/${id}/responses/analytics`} className="btn btn-secondary">
                <ChartColumn aria-hidden="true" /> Analytics
              </Link>
              <button onClick={handleExportCSV} className="btn btn-primary" disabled={count === 0}>
                <Download aria-hidden="true" /> Export CSV
              </button>
            </>
          }
        />
      </div>

      <div className="spreadsheet-pagination">
        <Pagination page={page} pageSize={50} count={count} onPage={setPage} disabled={pageLoading} />
      </div>

      {responses.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No responses yet"
          description="Share your form’s link or QR code, and responses will show up here as they arrive."
        />
      ) : (
        <div className="spreadsheet-wrapper">
          <div className="spreadsheet-scroll" ref={scrollRef} aria-busy={pageLoading}>
            <table className="spreadsheet-table">
              <thead>
                <tr>
                  {columns.map((col, i) => (
                    <th
                      key={col.key}
                      className={[
                        i === 0 ? 'row-header' : '',
                        col.sortable ? 'sortable' : '',
                        sort.key === col.key ? 'sorted' : '',
                      ].join(' ')}
                      style={{ minWidth: col.width, maxWidth: col.width }}
                      onClick={() => col.sortable && handleSort(col.key)}
                      onKeyDown={(e) => {
                        if (col.sortable && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault()
                          handleSort(col.key)
                        }
                      }}
                      tabIndex={col.sortable ? 0 : undefined}
                      aria-sort={sort.key === col.key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                      title={col.label}
                    >
                      <span className="spreadsheet-header-content">
                        <span className="spreadsheet-header-label">{col.label}</span>
                        {col.sortable && (
                          <span className={`spreadsheet-sort-icon ${sort.key === col.key ? 'active' : ''}`} aria-hidden="true">
                            {sort.key !== col.key
                              ? <ChevronsUpDown size={14} />
                              : sort.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                          </span>
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => (
                  <tr key={row.id}>
                    {columns.map((col, colIndex) => (
                      <td
                        key={col.key}
                        className={colIndex === 0 ? 'row-header' : ''}
                        style={{ minWidth: col.width, maxWidth: col.width }}
                        title={typeof row[col.key] === 'string' ? row[col.key] : undefined}
                      >
                        {col.key === 'submittedAt'
                          ? new Date(row[col.key]).toLocaleString()
                          : row[`__isMedia_${col.key}`]
                            ? (
                              <a
                                href={row[col.key]}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="spreadsheet-link"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Paperclip size={12} aria-hidden="true" />
                                {row[col.key].split('/').pop()}
                              </a>
                            )
                            : row[col.key]}
                      </td>
                    ))}
                  </tr>
                ))}
                {fillerRowCount > 0 &&
                  Array.from({ length: fillerRowCount }, (_, i) => (
                    <tr
                      key={`filler-${i}`}
                      className="spreadsheet-filler-row"
                      aria-hidden="true"
                      style={dataRowHeight > 0 ? { height: dataRowHeight } : undefined}
                    >
                      {columns.map((col, colIndex) => (
                        <td
                          key={col.key}
                          className={colIndex === 0 ? 'row-header' : ''}
                          style={{ minWidth: col.width, maxWidth: col.width }}
                        />
                      ))}
                    </tr>
                  ))}
                {fillerRemainder > 0 && (
                  <tr className="spreadsheet-filler-row spreadsheet-filler-remainder" aria-hidden="true">
                    {columns.map((col, colIndex) => (
                      <td
                        key={col.key}
                        className={colIndex === 0 ? 'row-header' : ''}
                        style={{ minWidth: col.width, maxWidth: col.width, height: fillerRemainder }}
                      />
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Toast toast={toast} />
    </div>
  )
}

function formatSortableAnswer(answer, question) {
  if (!answer) return ''

  if (['multiple_choice', 'multiple_select'].includes(question.question_type)) {
    const choices = Array.isArray(answer.selected_choices)
      ? answer.selected_choices
      : answer.selected_choices
        ? [answer.selected_choices]
        : []
    if (choices.length === 0) return ''

    const choiceMap = {}
    if (question.choices) {
      question.choices.forEach((c) => {
        choiceMap[c.id] = c.text
      })
    }
    return choices.map((cId) => choiceMap[cId] || cId).join(', ')
  }

  if (question.question_type === 'media') {
    return answer.file_answer || ''
  }

  return answer.text_answer || ''
}
