import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * A backstop around the board. Drag-and-drop is the one place where a thrown
 * error can cascade into a React render loop and white-screen the whole app, so
 * a failure here shows a recoverable panel instead of taking the page with it.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[crunchy] render error', error, info.componentStack)
  }

  override render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="m-6 rounded-card border border-danger/30 bg-danger-soft p-4 text-sm">
        <p className="font-medium text-danger">Something broke rendering this view.</p>
        <p className="mt-1 text-danger">{this.state.error.message}</p>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          className="mt-3 rounded-control bg-danger px-3 py-1.5 text-xs font-medium text-accent-ink"
        >
          Try again
        </button>
      </div>
    )
  }
}
