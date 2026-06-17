import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import FormSpreadsheet from './FormSpreadsheet'
import { getForm, getFormResponses, exportFormResponses } from '../api'

vi.mock('../api', () => ({
  getForm: vi.fn(),
  getFormResponses: vi.fn(),
  exportFormResponses: vi.fn(),
}))

function mockDimensions({ scrollHeight = 600, tableHeight = 200, rowHeight = 40 } = {}) {
  const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')
  const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')

  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() {
      if (this.classList.contains('spreadsheet-scroll')) return scrollHeight
      return originalClientHeight ? originalClientHeight.get.call(this) : 0
    },
  })

  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get() {
      if (this.classList.contains('spreadsheet-table')) return tableHeight
      if (this.tagName === 'TR') {
        if (this.classList.contains('spreadsheet-filler-row')) return rowHeight
        return rowHeight
      }
      return originalOffsetHeight ? originalOffsetHeight.get.call(this) : 0
    },
  })

  return () => {
    if (originalClientHeight) {
      Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalClientHeight)
    }
    if (originalOffsetHeight) {
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight)
    }
  }
}

function renderAtRoute(ui, route = '/forms/1/responses/spreadsheet') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/forms/:id/responses/spreadsheet" element={ui} />
      </Routes>
    </MemoryRouter>
  )
}

describe('FormSpreadsheet', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('stretches empty filler cells to the bottom when responses do not fill the viewport', async () => {
    getForm.mockResolvedValue({
      data: {
        id: 1,
        title: 'Test Form',
        sections: [
          {
            id: 10,
            title: 'Section',
            questions: [
              { id: 101, text: 'Name', question_type: 'text' },
              { id: 102, text: 'Score', question_type: 'number' },
            ],
          },
        ],
      },
    })

    getFormResponses.mockResolvedValue({
      data: {
        results: [
          { id: 1, created_at: '2026-01-01T10:00:00Z', answers: [{ question: 101, text_answer: 'Alice' }] },
          { id: 2, created_at: '2026-01-02T10:00:00Z', answers: [{ question: 101, text_answer: 'Bob' }] },
        ],
      },
    })

    const restore = mockDimensions({ scrollHeight: 600, tableHeight: 200, rowHeight: 40 })

    try {
      renderAtRoute(<FormSpreadsheet />)

      await waitFor(() => {
        expect(document.querySelector('.spreadsheet-table')).toBeTruthy()
      })

      const fillerRows = document.querySelectorAll('.spreadsheet-filler-row')
      expect(fillerRows.length).toBe(10)
    } finally {
      restore()
    }
  })

  it('adds a final filler row with remainder height when empty space is not an exact multiple of row height', async () => {
    getForm.mockResolvedValue({
      data: {
        id: 1,
        title: 'Test Form',
        sections: [
          {
            id: 10,
            title: 'Section',
            questions: [{ id: 101, text: 'Name', question_type: 'text' }],
          },
        ],
      },
    })

    getFormResponses.mockResolvedValue({
      data: {
        results: [
          { id: 1, created_at: '2026-01-01T10:00:00Z', answers: [{ question: 101, text_answer: 'Alice' }] },
        ],
      },
    })

    // tableHeight=100 (data fills 100px), scrollHeight=430, rowHeight=40
    // emptySpace = 430 - 100 = 330, fullRows = floor(330/40) = 8, remainder = 330 - 8*40 = 10
    const restore = mockDimensions({ scrollHeight: 430, tableHeight: 100, rowHeight: 40 })

    try {
      renderAtRoute(<FormSpreadsheet />)

      await waitFor(() => {
        expect(document.querySelector('.spreadsheet-table')).toBeTruthy()
      })

      const fillerRows = document.querySelectorAll('.spreadsheet-filler-row')
      // 8 full-height filler rows + 1 remainder row = 9
      expect(fillerRows.length).toBe(9)
    } finally {
      restore()
    }
  })

  it('does not render filler rows when responses already fill the viewport', async () => {
    getForm.mockResolvedValue({
      data: {
        id: 1,
        title: 'Test Form',
        sections: [
          {
            id: 10,
            title: 'Section',
            questions: [{ id: 101, text: 'Name', question_type: 'text' }],
          },
        ],
      },
    })

    getFormResponses.mockResolvedValue({
      data: {
        results: [
          { id: 1, created_at: '2026-01-01T10:00:00Z', answers: [{ question: 101, text_answer: 'A' }] },
          { id: 2, created_at: '2026-01-02T10:00:00Z', answers: [{ question: 101, text_answer: 'B' }] },
          { id: 3, created_at: '2026-01-03T10:00:00Z', answers: [{ question: 101, text_answer: 'C' }] },
        ],
      },
    })

    const restore = mockDimensions({ scrollHeight: 200, tableHeight: 250, rowHeight: 40 })

    try {
      renderAtRoute(<FormSpreadsheet />)

      await waitFor(() => {
        expect(document.querySelector('.spreadsheet-table')).toBeTruthy()
      })

      const fillerRows = document.querySelectorAll('.spreadsheet-filler-row')
      expect(fillerRows.length).toBe(0)
    } finally {
      restore()
    }
  })

  it('sets filler row height to match data row height so empty cells do not collapse', async () => {
    getForm.mockResolvedValue({
      data: {
        id: 1,
        title: 'Test Form',
        sections: [
          {
            id: 10,
            title: 'Section',
            questions: [{ id: 101, text: 'Name', question_type: 'text' }],
          },
        ],
      },
    })

    getFormResponses.mockResolvedValue({
      data: {
        results: [
          { id: 1, created_at: '2026-01-01T10:00:00Z', answers: [{ question: 101, text_answer: 'Alice' }] },
        ],
      },
    })

    const restore = mockDimensions({ scrollHeight: 600, tableHeight: 100, rowHeight: 50 })

    try {
      renderAtRoute(<FormSpreadsheet />)

      await waitFor(() => {
        expect(document.querySelector('.spreadsheet-table')).toBeTruthy()
      })

      const fillerRows = document.querySelectorAll('.spreadsheet-filler-row')
      // emptySpace = 600 - 100 = 500, fullRows = 500/50 = 10
      expect(fillerRows.length).toBe(10)
      // Each filler row should have an explicit height set to match the data row height
      // (otherwise empty cells collapse and the table does not reach the bottom of the viewport)
      fillerRows.forEach((row) => {
        const inlineHeight = row.style.height
        const cellHeight = row.querySelector('td')?.style.height
        const hasHeight =
          (inlineHeight && inlineHeight !== '') || (cellHeight && cellHeight !== '')
        expect(hasHeight).toBe(true)
      })
    } finally {
      restore()
    }
  })

  it('does not render filler rows when there are no data rows to measure', async () => {
    getForm.mockResolvedValue({
      data: {
        id: 1,
        title: 'Test Form',
        sections: [
          {
            id: 10,
            title: 'Section',
            questions: [{ id: 101, text: 'Name', question_type: 'text' }],
          },
        ],
      },
    })

    // responses array is empty
    getFormResponses.mockResolvedValue({
      data: { results: [] },
    })

    const restore = mockDimensions({ scrollHeight: 600, tableHeight: 50, rowHeight: 40 })

    try {
      renderAtRoute(<FormSpreadsheet />)

      await waitFor(() => {
        expect(screen.getByText('No responses yet')).toBeTruthy()
      })

      const fillerRows = document.querySelectorAll('.spreadsheet-filler-row')
      expect(fillerRows.length).toBe(0)
    } finally {
      restore()
    }
  })
})
