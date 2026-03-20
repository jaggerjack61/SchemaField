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
        <div className="error-boundary">
          <h1>Something went wrong.</h1>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <pre className="error-boundary-details">
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
