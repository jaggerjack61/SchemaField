import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

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

  return (
    <div className="login-page abstract-theme">
      <div className="grid-bg"></div>
      
      <div className="login-container-abstract">
        <Link to="/" className="brand-link">
          <span className="logo-icon-small">S</span>
          SchemaField
        </Link>
        
        <div className="login-card-abstract">
          <div className="card-header">
            <h2>Authentication</h2>
            <p>Enter your credentials to access the workspace.</p>
          </div>

          {error && (
            <div className="error-message-abstract">
              <span className="error-icon">!</span>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label>Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="name@example.com"
                className="input-abstract"
              />
            </div>

            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="input-abstract"
              />
            </div>

            <button 
              type="submit" 
              className="btn btn-primary btn-block"
              disabled={loading || cooldown > 0}
            >
              {cooldown > 0 ? `Too many attempts. Retry in ${cooldown}s` : loading ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>
          

        </div>
      </div>
    </div>
  )
}
