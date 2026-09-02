import { beforeEach, describe, expect, it, vi } from 'vitest'

const { state } = vi.hoisted(() => ({
  state: {
    responseErrorHandler: null,
    axiosPost: vi.fn(),
  },
}))

vi.mock('axios', () => ({
  default: {
    create: () => ({
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: {
          use: (_ok, onError) => {
            state.responseErrorHandler = onError
          },
        },
      },
    }),
    post: (...args) => state.axiosPost(...args),
  },
}))

import './api'

function unauthorizedError(url = '/forms/') {
  return {
    config: { url, headers: {}, _retry: false },
    response: { status: 401 },
  }
}

function setLocation(pathname) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { pathname, href: '', origin: 'http://localhost:5173' },
  })
}

describe('401 response interceptor on public share routes', () => {
  beforeEach(() => {
    state.axiosPost.mockReset()
    localStorage.clear()
    localStorage.setItem('access_token', 'expired-access')
    localStorage.setItem('refresh_token', 'stale-refresh')
  })

  it('does not redirect to /login when refresh fails on /f/:shareId', async () => {
    setLocation('/f/abc123')
    state.axiosPost.mockRejectedValue(new Error('token_not_valid'))

    await expect(
      state.responseErrorHandler(unauthorizedError('/forms/by-share-id/abc123/'))
    ).rejects.toThrow('token_not_valid')

    expect(window.location.href).toBe('')
    expect(localStorage.getItem('access_token')).toBeNull()
    expect(localStorage.getItem('refresh_token')).toBeNull()
  })

  it('does not redirect when no refresh token exists on /f/:shareId', async () => {
    setLocation('/f/abc123')
    localStorage.removeItem('refresh_token')

    await expect(
      state.responseErrorHandler(unauthorizedError('/forms/by-share-id/abc123/'))
    ).rejects.toBeTruthy()

    expect(window.location.href).toBe('')
    expect(localStorage.getItem('access_token')).toBeNull()
  })

  it('still redirects to /login when refresh fails on a protected route', async () => {
    setLocation('/dashboard')
    state.axiosPost.mockRejectedValue(new Error('token_not_valid'))

    await expect(
      state.responseErrorHandler(unauthorizedError('/forms/'))
    ).rejects.toThrow('token_not_valid')

    expect(window.location.href).toBe('/login')
  })
})
