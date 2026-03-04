import { Suspense, lazy } from 'react'
import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Navbar from './components/Navbar'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const FormBuilder = lazy(() => import('./pages/FormBuilder'))
const FormPreview = lazy(() => import('./pages/FormPreview'))
const PublicFormView = lazy(() => import('./pages/PublicFormView'))
const FormResponses = lazy(() => import('./pages/FormResponses'))
const FormAnalytics = lazy(() => import('./pages/FormAnalytics'))
const Login = lazy(() => import('./pages/Login'))
const LandingPage = lazy(() => import('./pages/LandingPage'))
const AdminPanel = lazy(() => import('./pages/AdminPanel'))
const AdminUserManagement = lazy(() => import('./pages/AdminUserManagement'))
const AdminFileManagement = lazy(() => import('./pages/AdminFileManagement'))

function App() {
  return (
    <AuthProvider>
      <div className="app">
        <Navbar />
        <main className="main-content">
          <Suspense fallback={<div className="loading"><div className="spinner" /></div>}>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<Login />} />
            <Route path="/f/:shareId" element={<PublicFormView />} />
            <Route path="/forms/:id/view" element={<PublicFormView />} />

            {/* Protected Routes */}
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/forms/new" element={<FormBuilder />} />
              <Route path="/forms/:id/edit" element={<FormBuilder />} />
              <Route path="/forms/:id/preview" element={<FormPreview />} />
              <Route path="/forms/:id/responses" element={<FormResponses />} />
              <Route path="/forms/:id/responses/analytics" element={<FormAnalytics />} />
            </Route>

            {/* Admin Routes */}
            <Route element={<ProtectedRoute adminOnly />}>
              <Route path="/admin" element={<AdminPanel />} />
              <Route path="/admin/users" element={<AdminUserManagement />} />
              <Route path="/admin/files" element={<AdminFileManagement />} />
            </Route>
          </Routes>
          </Suspense>
        </main>
      </div>
    </AuthProvider>
  )
}

export default App
