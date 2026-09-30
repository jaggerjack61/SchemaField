import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
}))

vi.mock('axios', () => ({
  default: {
    create: () => ({
      get: getMock,
      post: vi.fn(),
      patch: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    }),
    post: vi.fn(),
  },
}))

import { getUsers, getFormResponses, getFileManagerBrowser } from './api'

describe('paginated API loading', () => {
  beforeEach(() => {
    getMock.mockReset()
  })

  it('loads only the requested response page even when another page exists', async () => {
    getMock.mockResolvedValue({ data: { count: 200, next: '/api/forms/1/responses/?page=2', results: [{ id: 1 }] } })
    const result = await getFormResponses(1, { page: 1 })
    expect(getMock).toHaveBeenCalledTimes(1)
    expect(getMock).toHaveBeenCalledWith('/forms/1/responses/', { params: { page_size: 50, page: 1 }, signal: undefined })
    expect(result.data.count).toBe(200)
    expect(result.data.next).toBeTruthy()
  })

  it('passes file browser pagination to the backend', async () => {
    getMock.mockResolvedValue({ data: {} })
    await getFileManagerBrowser('uploads', 3)
    expect(getMock).toHaveBeenCalledWith('/users/file-manager/browser/', { params: { path: 'uploads', page: 3 } })
  })

  it('fetches the remaining pages in parallel and returns one combined result set', async () => {
    getMock.mockImplementation(async (url, config) => {
      const page = config.params.page || 1
      const pages = { 1: [{ id: 1 }, { id: 2 }], 2: [{ id: 3 }, { id: 4 }], 3: [{ id: 5 }] }
      return { data: { count: 5, next: page < 3 ? `http://localhost/api/users/?page=${page + 1}` : null, previous: null, results: pages[page] } }
    })

    const response = await getUsers('ann')

    expect(getMock).toHaveBeenCalledTimes(3)
    expect(getMock).toHaveBeenNthCalledWith(1, '/users/', { params: { page_size: 100, search: 'ann' }, signal: undefined })
    expect(getMock).toHaveBeenCalledWith('/users/', { params: { page_size: 100, search: 'ann', page: 3 }, signal: undefined })
    expect(response.data.results.map(user => user.id)).toEqual([1, 2, 3, 4, 5])
    expect(response.data.next).toBeNull()
  })
})
