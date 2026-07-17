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

import { getForms } from './api'

describe('paginated API loading', () => {
  beforeEach(() => {
    getMock.mockReset()
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
