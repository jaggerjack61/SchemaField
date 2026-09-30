import { Suspense, lazy } from 'react'
import { Routes, Route, useParams } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Navbar from './components/Navbar'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const FormBuilder = lazy(() => import('./pages/FormBuilder'))
const FormPreview = lazy(() => import('./pages/FormPreview'))
const PublicFormView = lazy(() => import('./pages/PublicFormView'))
const FormResponses = lazy(() => import('./pages/FormResponses'))
const FormSpreadsheet = lazy(() => import('./pages/FormSpreadsheet'))
const FormAnalytics = lazy(() => import('./pages/FormAnalytics'))
const Login = lazy(() => import('./pages/Login'))
const LandingPage = lazy(() => import('./pages/LandingPage'))
const AdminPanel = lazy(() => import('./pages/AdminPanel'))
const AdminUserManagement = lazy(() => import('./pages/AdminUserManagement'))
const AdminFileManagement = lazy(() => import('./pages/AdminFileManagement'))
const Profile = lazy(() => import('./pages/Profile'))
const NotFound = lazy(() => import('./pages/NotFound'))

// React Router reuses the component instance when switching between routes
// that render the same element. Key the builder per form so the "new form"
// page and each edit page always start from fresh state.
function FormBuilderRoute() {
  const { id } = useParams()
  return <FormBuilder key={id ?? 'new'} />
}

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

            {/* Protected Routes */}
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/forms/new" element={<FormBuilderRoute />} />
              <Route path="/forms/:id/edit" element={<FormBuilderRoute />} />
              <Route path="/forms/:id/preview" element={<FormPreview />} />
              <Route path="/forms/:id/view" element={<PublicFormView />} />
              <Route path="/forms/:id/responses" element={<FormResponses />} />
              <Route path="/forms/:id/responses/spreadsheet" element={<FormSpreadsheet />} />
              <Route path="/forms/:id/responses/analytics" element={<FormAnalytics />} />
            </Route>

            {/* Admin Routes */}
            <Route element={<ProtectedRoute adminOnly />}>
              <Route path="/admin" element={<AdminPanel />} />
              <Route path="/admin/users" element={<AdminUserManagement />} />
              <Route path="/admin/files" element={<AdminFileManagement />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </main>
      </div>
    </AuthProvider>
  )
}

export default App
