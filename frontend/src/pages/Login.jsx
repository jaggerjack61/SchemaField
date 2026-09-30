import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, CircleAlert, LoaderCircle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import Logo from '../components/Logo'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [failCount, setFailCount] = useState(0)
  const [cooldown, setCooldown] = useState(0)
  const { login, user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (user) {
      navigate('/dashboard')
    }
  }, [user, navigate])

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown(c => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await login(email, password)
      setFailCount(0)
      navigate('/dashboard')
    } catch (err) {
      console.error(err)
      setError(err.response?.data?.detail || 'Failed to login')
      const newFailCount = failCount + 1
      setFailCount(newFailCount)
      if (newFailCount >= 3) {
        setCooldown(30)
      }
    } finally {
      setLoading(false)
    }
  }

  const locked = cooldown > 0

  return (
    <div className="auth-page full-bleed">
      <div className="auth-backdrop" aria-hidden="true" />

      <div className="auth-container">
        <Link to="/" className="auth-brand" aria-label="SchemaField home">
          <Logo size={36} />
        </Link>

        <div className="auth-card card">
          <div className="auth-card-header">
            <h1>Sign in to SchemaField</h1>
            <p>Enter your credentials to access your workspace.</p>
          </div>

          {error && (
            <div className="alert alert-danger" role="alert">
              <CircleAlert aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="field">
              <label className="field-label" htmlFor="login-email">Email</label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="name@company.com"
                className="input"
              />
            </div>

            <div className="field">
              <label className="field-label" htmlFor="login-password">Password</label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Enter your password"
                className="input"
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-lg btn-block"
              disabled={loading || locked}
            >
              {loading && <LoaderCircle className="btn-spinner" aria-hidden="true" />}
              {locked ? `Too many attempts. Retry in ${cooldown}s` : loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="auth-note">Accounts are created by your workspace administrator.</p>
        </div>

        <Link to="/" className="auth-back">
          <ArrowLeft size={14} aria-hidden="true" /> Back to home
        </Link>
      </div>
    </div>
  )
}
