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
    
    // If 401 and not already retrying
    if (error.response?.status === 401 && !originalRequest._retry) {
      const url = originalRequest?.url ?? ''
      const isAuthRequest =
        url.includes('/auth/login/') ||
        url.includes('/auth/register/') ||
        url.includes('/auth/token/') ||
        url.includes('/auth/refresh/')
      const hasAccessToken = Boolean(localStorage.getItem('access_token'))

      if (!isAuthRequest && hasAccessToken) {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        if (window.location.pathname !== '/login') {
          window.location.href = '/login'
        }
      }
    }
    return Promise.reject(error)
  }
)

export const login = (email, password) => api.post('/auth/login/', { email, password })
export const getMe = () => api.get('/auth/me/')

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

// Users (Admin)
export const getUsers = () => api.get('/users/')
export const createUser = (data) => api.post('/users/', data)
export const resetUserPassword = (id, password) => api.post('/users/' + id + '/reset_password/', { password })

// Permissions
export const getFormPermissions = () => api.get('/permissions/')
export const addFormPermission = (data) => api.post('/permissions/', data)
export const removeFormPermission = (id) => api.delete('/permissions/' + id + '/')

export default api
