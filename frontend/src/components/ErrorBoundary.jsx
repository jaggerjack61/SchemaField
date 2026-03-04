import React from 'react'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', color: 'red', background: 'white' }}>
          <h1>Something went wrong.</h1>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <pre style={{ textAlign: 'left', fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '1rem', maxWidth: '600px', overflow: 'auto' }}>
              {this.state.error.toString()}
            </pre>
          )}
          {process.env.NODE_ENV !== 'development' && (
            <p>An unexpected error occurred. Please refresh the page.</p>
          )}
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
