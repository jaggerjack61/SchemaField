import React from 'react'
import { TriangleAlert } from 'lucide-react'
import EmptyState from './EmptyState'

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
          <div>
            <EmptyState
              icon={TriangleAlert}
              tone="danger"
              title="Something went wrong"
              description="An unexpected error occurred. Reloading the page usually fixes it."
              action={
                <button className="btn btn-primary" onClick={() => window.location.reload()}>
                  Reload page
                </button>
              }
            />
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <pre className="error-boundary-details">{this.state.error.toString()}</pre>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
