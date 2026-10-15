import { Component } from 'react';
import { useLocation, useRouteError } from 'react-router';
import { ErrorState } from './ErrorState';

/**
 * Catches render errors. `level="app"` fills the page; `level="route"` stays inside the shell
 * so navigation keeps working. Error details are not logged (they may contain response data).
 * @extends {Component<{ level?: 'app' | 'route', resetKey?: unknown, children?: import('react').ReactNode }, { error: unknown }>}
 */
export class ErrorBoundary extends Component {
  /** @param {{ level?: 'app' | 'route', resetKey?: unknown, children?: import('react').ReactNode }} props */
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.reset = this.reset.bind(this);
  }

  /** @param {unknown} error */
  static getDerivedStateFromError(error) {
    return { error: error ?? new Error('Unknown error') };
  }

  /** @param {{ resetKey?: unknown }} prevProps */
  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) this.reset();
  }

  reset() {
    this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.level === 'app') {
      return (
        <main className="flex min-h-dvh items-center justify-center bg-canvas p-4">
          <ErrorState
            className="w-full max-w-md"
            error={this.state.error}
            message="AgriSence ran into a problem. Reload the page to continue."
            onRetry={() => window.location.reload()}
          />
        </main>
      );
    }
    return <ErrorState error={this.state.error} onRetry={this.reset} />;
  }
}

/** Route level boundary that resets when the user navigates elsewhere. */
export function RouteErrorBoundary({ children }) {
  const location = useLocation();
  return (
    <ErrorBoundary level="route" resetKey={location.pathname}>
      {children}
    </ErrorBoundary>
  );
}

/** errorElement for the router (errors thrown while matching or loading a route, such as a failed lazy chunk). */
export function RouteErrorElement() {
  const error = useRouteError();
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas p-4">
      <ErrorState
        className="w-full max-w-md"
        error={error}
        message="This page could not be loaded. Check your connection and try again."
        onRetry={() => window.location.reload()}
      />
    </main>
  );
}
