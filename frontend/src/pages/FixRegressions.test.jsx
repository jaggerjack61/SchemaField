import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useNavigationType } from 'react-router-dom'
import FormBuilder from './FormBuilder'
import Dashboard from './Dashboard'
import FormPermissions from '../components/FormPermissions'
import * as api from '../api'

vi.mock('../api', () => ({
  getForm: vi.fn(), createForm: vi.fn(), updateForm: vi.fn(), uploadQuestionMedia: vi.fn(),
  getFormsPage: vi.fn(), deleteForm: vi.fn(), archiveForm: vi.fn(), restoreForm: vi.fn(),
  getFormPermissions: vi.fn(), addFormPermission: vi.fn(), removeFormPermission: vi.fn(),
}))

const savedForm = {
  id: 1, title: 'Original title', description: '', deadline: null, share_id: 'share', qr_code: null,
  sections: [{ id: 1, title: 'S', description: '', order: 0, questions: [
    { id: 1, text: 'Q', question_type: 'short_text', required: false, order: 0, choices: [] },
  ] }],
}

beforeEach(() => vi.resetAllMocks())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('form builder', () => {
  it('keeps edits made while a media upload is in flight', async () => {
    api.getForm.mockResolvedValue({ data: structuredClone(savedForm) })
    let finishUpload
    api.uploadQuestionMedia.mockImplementation(() => new Promise(resolve => { finishUpload = resolve }))
    const { container } = render(
      <MemoryRouter initialEntries={['/forms/1/edit']}>
        <Routes><Route path="/forms/:id/edit" element={<FormBuilder />} /></Routes>
      </MemoryRouter>,
    )
    const title = await screen.findByDisplayValue('Original title')
    fireEvent.change(container.querySelector('.question-media-upload input[type=file]'), {
      target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] },
    })
    expect(screen.getByRole('button', { name: /Uploading media/ }).disabled).toBe(true)

    fireEvent.change(title, { target: { value: 'Edited while uploading' } })
    await act(async () => { finishUpload({ data: { path: 'question_media/a.png', url: '/media/question_media/a.png' } }) })

    expect(container.querySelector('.form-title-input').value).toBe('Edited while uploading')
    expect(container.querySelector('.question-media-preview img')).toBeTruthy()
  })

  it('shows why a media file was rejected instead of failing silently', async () => {
    api.getForm.mockResolvedValue({ data: structuredClone(savedForm) })
    const { container } = render(
      <MemoryRouter initialEntries={['/forms/1/edit']}>
        <Routes><Route path="/forms/:id/edit" element={<FormBuilder />} /></Routes>
      </MemoryRouter>,
    )
    await screen.findByDisplayValue('Original title')
    fireEvent.change(container.querySelector('.question-media-upload input[type=file]'), {
      target: { files: [new File(['x'], 'notes.pdf', { type: 'application/pdf' })] },
    })
    expect(screen.getByRole('alert').textContent).toMatch(/Unsupported file type/)
    expect(api.uploadQuestionMedia).not.toHaveBeenCalled()
  })

  it('replaces the "new form" history entry after creating a form', async () => {
    api.createForm.mockResolvedValue({ data: { ...structuredClone(savedForm), id: 7 } })
    function EditProbe() {
      return <p>navigation: {useNavigationType()}</p>
    }
    render(
      <MemoryRouter initialEntries={['/dashboard', '/forms/new']} initialIndex={1}>
        <Routes>
          <Route path="/forms/new" element={<FormBuilder />} />
          <Route path="/forms/:id/edit" element={<EditProbe />} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: /Create Form/ }))
    expect(await screen.findByText('navigation: REPLACE')).toBeTruthy()
  })
})

describe('dashboard', () => {
  it('keeps loading pages while the loader stays on screen', async () => {
    // A loader that is always visible: the observer reports it on observe().
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback) { this.callback = callback }
      observe() { this.callback([{ isIntersecting: true }]) }
      disconnect() {}
    })
    const pages = { 1: 24, 2: 24, 3: 12 }
    api.getFormsPage.mockImplementation(async ({ page }) => ({
      data: {
        count: 60,
        results: Array.from({ length: pages[page] }, (_, i) => ({
          id: (page - 1) * 24 + i + 1, title: `Form ${(page - 1) * 24 + i + 1}`, description: '',
          section_count: 1, question_count: 1, response_count: 0, updated_at: '2026-09-12T00:00:00Z',
          is_owned: true, owner_name: 'Me', user_permissions: [], is_archived: false,
        })),
      },
    }))
    render(<MemoryRouter><Dashboard /></MemoryRouter>)
    expect(await screen.findByText('Form 60')).toBeTruthy()
    expect(api.getFormsPage).toHaveBeenCalledWith(expect.objectContaining({ page: 3, archived: 'false' }), expect.any(AbortSignal))
  })
})

describe('form permissions', () => {
  it('shows the server message for an unknown email', async () => {
    api.getFormPermissions.mockResolvedValue({ data: { results: [] } })
    api.addFormPermission.mockRejectedValue({ response: { data: { email: ['User with this email does not exist.'] } } })
    render(<FormPermissions formId={1} onClose={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText('User Email'), { target: { value: 'nobody@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(screen.getByText('User with this email does not exist.')).toBeTruthy())
  })
})
