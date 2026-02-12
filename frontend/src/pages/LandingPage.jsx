import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useEffect } from 'react'

export default function LandingPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (user) {
      navigate('/dashboard')
    }
  }, [user, navigate])

  return (
    <div className="landing-page abstract-theme">
      <div className="grid-bg"></div>
      
      {/* Hero Section */}
      <section className="hero-abstract">
        <div className="hero-content">
          <div className="badge-pill">v1.0.0 — Now Available</div>
          <h1 className="title-abstract">
            The Architecture <br />
            <span className="text-gradient">of Input.</span>
          </h1>
          <p className="hero-sub abstract">
            SchemaField is the primitive for data capture. <br />
            Transform chaos into structure with a seamless, type-safe schema layer.
          </p>
          <div className="hero-actions">
            <Link to="/login" className="btn btn-primary btn-lg">
              Start Building
            </Link>
            <a href="#manifesto" className="btn btn-secondary btn-lg">
              Read Manifesto
            </a>
          </div>
        </div>
      </section>

      {/* Abstract Features / Manifesto */}
      <section id="manifesto" className="manifesto-section">
        <div className="manifesto-grid">
          <div className="manifesto-card">
            <span className="card-number">01</span>
            <h3>Schema First</h3>
            <p>Define truth at the source. Rigid validation meets fluid user experience.</p>
          </div>
          <div className="manifesto-card">
            <span className="card-number">02</span>
            <h3>Invisible Flow</h3>
            <p>Interfaces that recede. Capture signals without friction.</p>
          </div>
          <div className="manifesto-card">
            <span className="card-number">03</span>
            <h3>Data Sovereignty</h3>
            <p>Your data, structured. Portable, typed, and ready for synthesis.</p>
          </div>
        </div>
      </section>



      <footer className="landing-footer abstract">
        <div className="footer-content">
          <div className="brand">SchemaField</div>
          <div className="links">
            <a href="https://linkedin.com/in/samuel-jarai" target="_blank" rel="noopener noreferrer">LinkedIn</a>
            <a href="https://github.com/jaggerjack61" target="_blank" rel="noopener noreferrer">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
