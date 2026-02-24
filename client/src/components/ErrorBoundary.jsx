import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '100vh', padding: '2rem',
          background: 'var(--bg, #1a1a2e)', color: 'var(--text, #e0e0e0)',
        }}>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Что-то пошло не так</h1>
          <p style={{ color: 'var(--text-secondary, #888)', marginBottom: '1.5rem', textAlign: 'center' }}>
            Произошла непредвиденная ошибка. Попробуйте обновить страницу.
          </p>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              onClick={this.handleReset}
              style={{
                padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none',
                background: 'var(--accent, #6c5ce7)', color: '#fff', cursor: 'pointer',
                fontSize: '1rem',
              }}
            >
              Попробовать снова
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '0.75rem 1.5rem', borderRadius: '8px',
                border: '1px solid var(--border, #333)', background: 'transparent',
                color: 'var(--text, #e0e0e0)', cursor: 'pointer', fontSize: '1rem',
              }}
            >
              Обновить страницу
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
