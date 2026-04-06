import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
})

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
            const { data } = await axios.post('/api/auth/token/refresh/', { refresh: refreshToken })
            localStorage.setItem('access_token', data.access)
            originalRequest.headers.Authorization = 'Bearer ' + data.access
            return api(originalRequest)
          } catch (refreshError) {
            // Refresh failed — log out
            localStorage.removeItem('access_token')
            localStorage.removeItem('refresh_token')
            if (window.location.pathname !== '/login') {
              window.location.href = '/login'
            }
            return Promise.reject(refreshError)
          }
        } else {
          localStorage.removeItem('access_token')
          if (window.location.pathname !== '/login') {
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
export const getForms = () => api.get('/forms/')
export const getForm = (id) => api.get('/forms/' + id + '/')
export const getFormByShareId = (shareId) => api.get('/forms/by-share-id/' + shareId + '/')
export const createForm = (data) => api.post('/forms/', data)
export const updateForm = (id, data) => api.put('/forms/' + id + '/', data)
export const deleteForm = (id) => api.delete('/forms/' + id + '/')
export const submitForm = (id, data) => api.post('/forms/' + id + '/submit/', data)
export const getFormResponses = (id) => api.get('/forms/' + id + '/responses/')
export const exportFormResponses = (id) => api.get('/forms/' + id + '/export_csv/', { responseType: 'blob' })  // Expect binary data

// Question media upload
export const uploadQuestionMedia = (file) => {
  const formData = new FormData()
  formData.append('file', file)
  return api.post('/upload-question-media/', formData)
}

// Users (Admin)
export const getUsers = () => api.get('/users/')
export const createUser = (data) => api.post('/users/', data)
export const updateUser = (id, data) => api.patch(`/users/${id}/`, data)
export const resetUserPassword = (id, password) => api.post('/users/' + id + '/reset_password/', { password })
export const getFileManagerSummary = () => api.get('/users/file-manager/summary/')
export const getFileManagerBrowser = (path = '') => api.get('/users/file-manager/browser/', { params: { path } })
export const deleteManagedFile = (path) => api.delete('/users/file-manager/file/', { params: { path } })
export const getCleanupPreview = (view = false) => api.get('/users/file-manager/cleanup-preview/', { params: { view } })
export const runOrphanedCleanup = () => api.post('/users/file-manager/cleanup-orphaned-files/')

// Permissions
export const getFormPermissions = () => api.get('/permissions/')
export const addFormPermission = (data) => api.post('/permissions/', data)
export const removeFormPermission = (id) => api.delete('/permissions/' + id + '/')

export default api
