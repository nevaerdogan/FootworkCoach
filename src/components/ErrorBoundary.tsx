import { Component, type ReactNode } from 'react';
import { Icon } from './Icon';

/** Last-resort fallback so a crash never leaves the user on a blank screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="screen" style={{ display: 'grid', placeItems: 'center', textAlign: 'center', padding: 'var(--gutter)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--s-4)' }}>
          <h2 className="h2">Something went wrong</h2>
          <p className="muted">Reload to get back to training.</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            <Icon name="refresh" /> Reload
          </button>
        </div>
      </main>
    );
  }
}
