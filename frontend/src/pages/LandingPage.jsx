import { Link, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import {
  ArrowRight,
  ChartColumn,
  CalendarClock,
  FileSpreadsheet,
  ListChecks,
  QrCode,
  UsersRound,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import Logo from '../components/Logo'

const FEATURES = [
  {
    icon: ListChecks,
    title: 'Typed questions',
    text: 'Short and long text, whole and decimal numbers, single and multiple choice, and media uploads — each validated at the source.',
  },
  {
    icon: QrCode,
    title: 'Share anywhere',
    text: 'Every form gets a public link and a QR code, so respondents can answer from any device without an account.',
  },
  {
    icon: ChartColumn,
    title: 'Live analytics',
    text: 'Answer breakdowns, daily and weekly trends, and stackable filters that narrow responses as you explore.',
  },
  {
    icon: FileSpreadsheet,
    title: 'Spreadsheet & CSV',
    text: 'Browse every response in a sortable grid, then export the full set or just the filtered slice to CSV.',
  },
  {
    icon: UsersRound,
    title: 'Team permissions',
    text: 'Invite teammates to edit a form or only view its responses. Owners stay in control of who sees what.',
  },
  {
    icon: CalendarClock,
    title: 'Deadlines',
    text: 'Set a closing time and SchemaField stops accepting responses automatically, in every respondent’s time zone.',
  },
]

export default function LandingPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (user) {
      navigate('/dashboard')
    }
  }, [user, navigate])

  return (
    <div className="landing full-bleed">
      <section className="landing-hero">
        <div className="landing-backdrop" aria-hidden="true" />
        <div className="landing-hero-inner">
          <span className="landing-eyebrow">
            <span className="badge badge-accent">New</span>
            Forms, responses and analytics in one place
          </span>
          <h1 className="landing-title">
            The architecture <br />
            <span className="landing-title-accent">of input.</span>
          </h1>
          <p className="landing-lead">
            SchemaField turns every form into clean, structured data. Build a form in minutes,
            share it with a link or QR code, and analyze responses as they arrive.
          </p>
          <div className="landing-actions">
            <Link to="/login" className="btn btn-primary btn-lg">
              Start building <ArrowRight aria-hidden="true" />
            </Link>
            <a href="#features" className="btn btn-secondary btn-lg">
              See features
            </a>
          </div>
        </div>

        <ProductPreview />
      </section>

      <section id="features" className="landing-section">
        <div className="landing-section-head">
          <span className="landing-kicker">Features</span>
          <h2>Everything between the question and the insight</h2>
          <p>From the first field you add to the CSV you hand off, every step keeps your data typed and tidy.</p>
        </div>
        <div className="landing-features">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div className="landing-feature" key={title}>
              <div className="landing-feature-icon"><Icon aria-hidden="true" /></div>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-cta">
        <h2>Ready to collect better data?</h2>
        <p>Sign in and publish your first form in a few minutes.</p>
        <Link to="/login" className="btn btn-primary btn-lg">
          Get started <ArrowRight aria-hidden="true" />
        </Link>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="landing-footer-brand">
            <Logo size={22} />
            <span>SchemaField</span>
          </div>
          <nav className="landing-footer-links" aria-label="Social">
            <a href="https://linkedin.com/in/samuel-jarai" target="_blank" rel="noopener noreferrer">LinkedIn</a>
            <a href="https://github.com/jaggerjack61" target="_blank" rel="noopener noreferrer">GitHub</a>
          </nav>
        </div>
      </footer>
    </div>
  )
}

// A static, decorative rendering of the builder and analytics views.
function ProductPreview() {
  const bars = [
    { label: 'Weekly', value: 68 },
    { label: 'Monthly', value: 44 },
    { label: 'Rarely', value: 21 },
  ]
  return (
    <div className="landing-preview" aria-hidden="true">
      <div className="preview-window">
        <div className="preview-window-bar">
          <span /><span /><span />
          <div className="preview-window-url">schemafield.app/f/customer-survey</div>
        </div>
        <div className="preview-window-body">
          <div className="preview-pane">
            <div className="preview-pane-title">Customer survey</div>
            <div className="preview-pane-sub">Section 1 · About you</div>
            <div className="preview-q">
              <div className="preview-q-label">How often do you use the product?</div>
              <div className="preview-choice is-selected"><i />Weekly</div>
              <div className="preview-choice"><i />Monthly</div>
              <div className="preview-choice"><i />Rarely</div>
            </div>
            <div className="preview-q">
              <div className="preview-q-label">What should we improve?</div>
              <div className="preview-input">Faster exports would be great…</div>
            </div>
            <div className="preview-submit">Submit</div>
          </div>
          <div className="preview-pane preview-pane-stats">
            <div className="preview-stats-row">
              <div className="preview-stat"><span>Responses</span><strong>1,284</strong></div>
              <div className="preview-stat"><span>This week</span><strong>+212</strong></div>
            </div>
            <div className="preview-q-label">How often do you use the product?</div>
            {bars.map(bar => (
              <div className="preview-bar" key={bar.label}>
                <span>{bar.label}</span>
                <div><i style={{ width: `${bar.value}%` }} /></div>
                <em>{bar.value}%</em>
              </div>
            ))}
            <div className="preview-spark">
              {[30, 42, 38, 55, 48, 66, 72, 61, 80, 76, 92, 88].map((h, i) => (
                <i key={i} style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
