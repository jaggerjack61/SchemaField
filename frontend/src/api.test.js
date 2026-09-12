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

import { getForms, getFormResponses, getFileManagerBrowser } from './api'

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

  it('follows every page and returns one combined result set', async () => {
    getMock
      .mockResolvedValueOnce({
        data: {
          count: 3,
          next: 'http://localhost/api/forms/?page=2&page_size=100',
          previous: null,
          results: [{ id: 1 }, { id: 2 }],
        },
      })
      .mockResolvedValueOnce({
        data: {
          count: 3,
          next: null,
          previous: 'http://localhost/api/forms/?page=1&page_size=100',
          results: [{ id: 3 }],
        },
      })

    const response = await getForms()

    expect(getMock).toHaveBeenNthCalledWith(1, '/forms/', {
      params: { page_size: 100 },
    })
    expect(getMock).toHaveBeenNthCalledWith(2, '/forms/?page=2&page_size=100')
    expect(response.data.results).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }])
    expect(response.data.next).toBeNull()
  })
})
