import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Navbar from './components/Navbar'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import FormBuilder from './pages/FormBuilder'
import FormPreview from './pages/FormPreview'
import PublicFormView from './pages/PublicFormView'
import FormResponses from './pages/FormResponses'
import AdminPanel from './pages/AdminPanel'
import LandingPage from './pages/LandingPage'

function App() {
  return (
    <AuthProvider>
      <div className="app">
        <Navbar />
        <main className="main-content">
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
            </Route>

            {/* Admin Routes */}
            <Route element={<ProtectedRoute adminOnly />}>
              <Route path="/admin" element={<AdminPanel />} />
            </Route>
          </Routes>
        </main>
      </div>
    </AuthProvider>
  )
}

export default App
