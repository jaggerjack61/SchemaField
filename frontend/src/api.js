import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
})

let refreshPromise = null

function isOnPublicRoute() {
  return window.location.pathname.startsWith('/f/')
}

function refreshAccessToken(refreshToken) {
  if (!refreshPromise) {
    refreshPromise = axios
      .post('/api/auth/token/refresh/', { refresh: refreshToken })
      .then(({ data }) => data.access)
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

const PAGE_FETCH_CONCURRENCY = 4

async function getAllPages(url, config = {}) {
  const params = { page_size: 100, ...(config.params || {}) }
  const firstResponse = await api.get(url, { ...config, params })

  if (!Array.isArray(firstResponse.data?.results)) {
    return firstResponse
  }

  const results = [...firstResponse.data.results]
  if (firstResponse.data.next && results.length > 0) {
    // The first page is full, so its length is the page size the server used.
    // Knowing the count, the remaining pages can be fetched in parallel.
    const pageCount = Math.ceil(firstResponse.data.count / results.length)
    const pages = Array.from({ length: pageCount - 1 }, (_, index) => index + 2)
    const pageResults = []
    for (let start = 0; start < pages.length; start += PAGE_FETCH_CONCURRENCY) {
      const batch = pages.slice(start, start + PAGE_FETCH_CONCURRENCY)
      const responses = await Promise.all(batch.map(page => api.get(url, { ...config, params: { ...params, page } })))
      pageResults.push(...responses.map(response => response.data.results))
    }
    pageResults.forEach(pageItems => results.push(...pageItems))
  }

  return {
    ...firstResponse,
    data: {
      ...firstResponse.data,
      count: results.length,
      next: null,
      previous: null,
      results,
    },
  }
}

// Request interceptor for adding auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token')
    if (token) {
      config.headers.Authorization = 'Bearer ' + token
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor for handling 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      const url = originalRequest?.url ?? ''
      const isAuthRequest =
        url.includes('/auth/login/') ||
        url.includes('/auth/register/') ||
        url.includes('/auth/token/') ||
        url.includes('/auth/refresh/')

      if (!isAuthRequest) {
        const refreshToken = localStorage.getItem('refresh_token')
        if (refreshToken) {
          originalRequest._retry = true
          try {
            const accessToken = await refreshAccessToken(refreshToken)
            localStorage.setItem('access_token', accessToken)
            originalRequest.headers.Authorization = 'Bearer ' + accessToken
            return api(originalRequest)
          } catch (refreshError) {
            // Only a rejected refresh token ends the session. Rate limiting,
            // server errors and network failures are transient.
            const refreshStatus = refreshError.response?.status
            if (refreshStatus === 400 || refreshStatus === 401) {
              localStorage.removeItem('access_token')
              localStorage.removeItem('refresh_token')
              if (!isOnPublicRoute() && window.location.pathname !== '/login') {
                window.location.href = '/login'
              }
            }
            return Promise.reject(refreshError)
          }
        } else {
          localStorage.removeItem('access_token')
          if (!isOnPublicRoute() && window.location.pathname !== '/login') {
            window.location.href = '/login'
          }
        }
      }
    }
    return Promise.reject(error)
  }
)

export const login = (email, password) => api.post('/auth/login/', { email, password })
export const getMe = () => api.get('/auth/me/')
export const updateProfile = (data) => api.patch('/auth/me/', data)
export const changePassword = (currentPassword, newPassword) => api.post('/auth/change-password/', { current_password: currentPassword, new_password: newPassword })

// Forms
export const getFormsPage = (params = {}, signal) => api.get('/forms/', { params, signal })
export const getForm = (id) => api.get('/forms/' + id + '/')
export const getFormByShareId = (shareId) => api.get('/forms/by-share-id/' + shareId + '/')
export const createForm = (data) => api.post('/forms/', data)
export const updateForm = (id, data) => api.put('/forms/' + id + '/', data)
export const deleteForm = (id) => api.delete('/forms/' + id + '/')
export const archiveForm = (id) => api.post('/forms/' + id + '/archive/')
export const restoreForm = (id) => api.post('/forms/' + id + '/restore/')
export const submitForm = (shareId, data) => api.post('/forms/by-share-id/' + shareId + '/submit/', data)
export const getFormResponses = (id, params = {}, signal) => api.get('/forms/' + id + '/responses/', { params: { page_size: 50, ...params }, signal })
export const getFormAnalytics = (id, params = {}, signal) => api.get('/forms/' + id + '/analytics/', { params, signal })
export const exportFormResponses = (id, params = {}) => api.get('/forms/' + id + '/export_csv/', {
  params: { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, ...params },
  responseType: 'blob',
})

// Question media upload
export const uploadQuestionMedia = (file) => {
  const formData = new FormData()
  formData.append('file', file)
  return api.post('/upload-question-media/', formData)
}

// Users (Admin)
export const getUsers = (search = '', signal) => getAllPages('/users/', { params: search ? { search } : {}, signal })
export const createUser = (data) => api.post('/users/', data)
export const updateUser = (id, data) => api.patch(`/users/${id}/`, data)
export const resetUserPassword = (id, password) => api.post('/users/' + id + '/reset_password/', { password })
export const getFileManagerSummary = () => api.get('/users/file-manager/summary/')
export const getFileManagerBrowser = (path = '', page = 1) => api.get('/users/file-manager/browser/', { params: { path, page } })
export const deleteManagedFile = (path) => api.delete('/users/file-manager/file/', { params: { path } })
export const getCleanupPreview = (view = false) => api.get('/users/file-manager/cleanup-preview/', { params: { view } })
export const runOrphanedCleanup = () => api.post('/users/file-manager/cleanup-orphaned-files/')

// Permissions
export const getFormPermissions = (formId) => getAllPages('/permissions/', {
  params: formId ? { form: formId } : {},
})
export const addFormPermission = (data) => api.post('/permissions/', data)
export const removeFormPermission = (id) => api.delete('/permissions/' + id + '/')

export default api
