import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import AdminUserManagement from './AdminUserManagement'
import { getUsers } from '../api'

vi.mock('../api', () => ({
  getUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  resetUserPassword: vi.fn(),
}))

function renderAtRoute(ui, route = '/admin/users') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/admin/users" element={ui} />
      </Routes>
    </MemoryRouter>
  )
}

describe('AdminUserManagement', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    getUsers.mockResolvedValue({
      data: {
        results: [
          { id: 1, name: 'Alice Smith', email: 'alice@example.com', role: 'user', is_active: true, date_joined: '2026-01-01T10:00:00Z' },
          { id: 2, name: 'Bob Jones', email: 'bob@example.com', role: 'admin', is_active: true, date_joined: '2026-01-02T10:00:00Z' },
        ],
      },
    })
  })

  it('renders the search input', async () => {
    renderAtRoute(<AdminUserManagement />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search users by name or email...')).toBeTruthy()
    })
  })

  it('loads users on mount', async () => {
    renderAtRoute(<AdminUserManagement />)

    await waitFor(() => {
      expect(getUsers).toHaveBeenCalledWith('')
    })

    expect(screen.getByText('Alice Smith')).toBeTruthy()
    expect(screen.getByText('Bob Jones')).toBeTruthy()
  })

  it('calls getUsers with the search term after typing', async () => {
    const user = userEvent.setup()
    renderAtRoute(<AdminUserManagement />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search users by name or email...')).toBeTruthy()
    })

    const searchInput = screen.getByPlaceholderText('Search users by name or email...')
    await user.type(searchInput, 'alice')

    await waitFor(() => {
      expect(getUsers).toHaveBeenLastCalledWith('alice')
    }, { timeout: 1500 })
  })

  it('keeps the search input visible while loading users', async () => {
    getUsers.mockImplementation(() => new Promise(() => {}))
    renderAtRoute(<AdminUserManagement />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search users by name or email...')).toBeTruthy()
    })

    const searchInput = screen.getByPlaceholderText('Search users by name or email...')
    expect(document.body.contains(searchInput)).toBe(true)
  })
})
