import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import FormBuilder from './FormBuilder'
import PublicFormView from './PublicFormView'
import AdminUserManagement from './AdminUserManagement'
import AdminFileManagement from './AdminFileManagement'
import FormSpreadsheet from './FormSpreadsheet'
import FormResponses from './FormResponses'
import FormAnalytics from './FormAnalytics'
import * as api from '../api'

vi.mock('../api', () => ({
  getForm: vi.fn(), createForm: vi.fn(), updateForm: vi.fn(), uploadQuestionMedia: vi.fn(),
  getFormByShareId: vi.fn(), submitForm: vi.fn(), getFormResponses: vi.fn(), exportFormResponses: vi.fn(), getFormAnalytics: vi.fn(),
  getUsers: vi.fn(), createUser: vi.fn(), updateUser: vi.fn(), resetUserPassword: vi.fn(),
  getFileManagerSummary: vi.fn(), getFileManagerBrowser: vi.fn(), deleteManagedFile: vi.fn(), getCleanupPreview: vi.fn(), runOrphanedCleanup: vi.fn(),
}))

const form = { id: 1, title: 'Review form', description: '', deadline: null, sections: [{ id: 1, title: 'Section', description: '', order: 0, questions: [] }] }
function mount(Component, path, pattern) {
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path={pattern} element={<Component />} /></Routes></MemoryRouter>)
}
beforeEach(() => vi.resetAllMocks())
afterEach(() => cleanup())

describe('review regressions', () => {
  it('uses server-assigned IDs on the second editor save', async () => {
    api.getForm.mockResolvedValue({ data: structuredClone(form) })
    api.updateForm.mockImplementation(async (id, payload) => {
      const saved = structuredClone(payload)
      saved.sections[0].questions[0].id = 99
      return { data: saved }
    })
    mount(FormBuilder, '/forms/1/edit', '/forms/:id/edit')
    fireEvent.click(await screen.findByRole('button', { name: /Add Question/ }))
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/ }))
    await screen.findByText('Form updated!')
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/ }))
    await waitFor(() => expect(api.updateForm).toHaveBeenCalledTimes(2))
    expect(api.updateForm.mock.calls[1][1].sections[0].questions[0].id).toBe(99)
  })

  it('submits an explicit empty answer list for optional questions', async () => {
    const f = structuredClone(form)
    f.sections[0].questions = [{ id: 1, text: 'Optional', required: false, question_type: 'short_text', choices: [] }]
    api.getFormByShareId.mockResolvedValue({ data: f })
    api.submitForm.mockResolvedValue({ data: {} })
    mount(PublicFormView, '/f/review', '/f/:shareId')
    fireEvent.click(await screen.findByRole('button', { name: 'Submit' }))
    await waitFor(() => expect(api.submitForm).toHaveBeenCalledWith(1, { answers: [] }))
    expect(await screen.findByText('Thank you!')).toBeTruthy()
  })

  it('can reset a newly created user without reloading the user list', async () => {
    api.getUsers.mockResolvedValue({ data: { results: [] } })
    api.createUser.mockResolvedValue({ data: { id: 42, name: 'Created', email: 'created@example.com', role: 'user', is_active: true, date_joined: '2026-09-12T00:00:00Z' } })
    api.resetUserPassword.mockResolvedValue({ data: {} })
    mount(AdminUserManagement, '/admin/users', '/admin/users')
    await screen.findByText('No users found.')
    fireEvent.click(screen.getByRole('button', { name: /Create User/ }))
    fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Created' } })
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'created@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'review-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await screen.findByText('Created')
    expect(screen.getByText('Active')).toBeTruthy()
    expect(screen.queryByText('Invalid Date')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Reset Pass' }))
    fireEvent.change(screen.getByPlaceholderText('New Password'), { target: { value: 'replacement-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    await waitFor(() => expect(api.resetUserPassword).toHaveBeenCalledWith(42, 'replacement-password'))
  })

  it('loads and displays file browser page two', async () => {
    api.getFileManagerSummary.mockResolvedValue({ data: {} })
    api.getCleanupPreview.mockResolvedValue({ data: { delete_count: 0 } })
    api.getFileManagerBrowser.mockImplementation(async (path, page) => ({ data: {
      current_path: '', parent_path: null, directories: [],
      files: [{ name: `File on page ${page}`, path: `file${page}.txt`, size_bytes: 1, url: `/media/file${page}.txt`, extension: 'txt' }],
      total_entries: 51, page, page_size: 50,
    } }))
    mount(AdminFileManagement, '/admin/files', '/admin/files')
    await screen.findByText('File on page 1')
    fireEvent.click(screen.getByRole('button', { name: /Next page/ }))
    expect(await screen.findByText('File on page 2')).toBeTruthy()
    expect(api.getFileManagerBrowser).toHaveBeenLastCalledWith('', 2)
    expect(screen.getByRole('button', { name: /Next page/ }).disabled).toBe(true)
  })

  it('requests globally sorted numeric pages and renders only the current page', async () => {
    const f = structuredClone(form)
    f.sections[0].questions = [{ id: 9, text: 'Score', question_type: 'number', choices: [] }]
    api.getForm.mockResolvedValue({ data: f })
    api.getFormResponses.mockImplementation(async (id, params) => ({ data: { count: 51, results: [{
      id: params.page, created_at: '2026-09-12T00:00:00Z', answers: [{ question: 9, text_answer: params.sort === 9 ? '2' : '10' }],
    }] } }))
    const { container } = mount(FormSpreadsheet, '/forms/1/responses/spreadsheet', '/forms/:id/responses/spreadsheet')
    fireEvent.click(await screen.findByRole('columnheader', { name: /Score/ }))
    await waitFor(() => expect(api.getFormResponses).toHaveBeenLastCalledWith('1', { page: 1, page_size: 50, sort: 9, direction: 'asc' }, expect.any(AbortSignal)))
    await waitFor(() => expect(container.querySelector('tbody tr td:last-child')?.textContent).toBe('2'))
    fireEvent.click(screen.getByRole('button', { name: /Next page/ }))
    await waitFor(() => expect(api.getFormResponses).toHaveBeenLastCalledWith('1', { page: 2, page_size: 50, sort: 9, direction: 'asc' }, expect.any(AbortSignal)))
    await screen.findByRole('columnheader', { name: /Score/ })
    expect(container.querySelectorAll('tbody tr:not(.spreadsheet-filler-row)').length).toBe(1)
  })

  it('uses server summaries and fetches individual responses only when requested', async () => {
    api.getForm.mockResolvedValue({ data: structuredClone(form) })
    api.getFormAnalytics.mockResolvedValue({ data: { count: 200, total_count: 200, questions: {}, trend: [] } })
    api.getFormResponses.mockImplementation(async (id, params) => ({ data: { count: 200, results: [{ id: params.page, created_at: '2026-09-12T00:00:00Z', answers: [] }] } }))
    mount(FormResponses, '/forms/1/responses', '/forms/:id/responses')
    await screen.findByText('200 responses')
    expect(api.getFormResponses).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Individual' }))
    await screen.findByText(/Submission at/)
    fireEvent.click(screen.getByRole('button', { name: /Next page/ }))
    await waitFor(() => expect(api.getFormResponses).toHaveBeenLastCalledWith('1', { page: 2, page_size: 1 }, expect.any(AbortSignal)))
  })

  it('filters analytics on the server without downloading response pages', async () => {
    const f = structuredClone(form)
    f.sections[0].questions = [{ id: 9, text: 'Text', question_type: 'short_text', choices: [] }]
    api.getForm.mockResolvedValue({ data: f })
    api.getFormAnalytics.mockImplementation(async (id, params) => ({ data: { count: params.filters === '[]' ? 200 : 1, total_count: 200, questions: {}, trend: [] } }))
    mount(FormAnalytics, '/forms/1/responses/analytics', '/forms/:id/responses/analytics')
    await screen.findByText('200 responses total')
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '9' } })
    fireEvent.change(screen.getByPlaceholderText('Type keyword or phrase'), { target: { value: 'needle' } })
    await screen.findByText('1 response (filtered from 200)')
    const params = api.getFormAnalytics.mock.calls.at(-1)[1]
    expect(JSON.parse(params.filters)[0]).toMatchObject({ questionId: '9', textQuery: 'needle' })
    expect(api.getFormResponses).not.toHaveBeenCalled()
  })
})
