import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[CVitae ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div style={{
          minHeight: '60vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', padding: '2rem',
          color: '#e8e8e0', background: '#111', fontFamily: 'system-ui',
          gap: '1rem',
        }}>
          <p style={{ color: '#ffffff60' }}>Algo salió mal cargando esta página.</p>
          <a href="/" style={{ color: '#c9a84c', textDecoration: 'none', fontSize: '0.875rem' }}>
            ← Volver al inicio
          </a>
        </div>
      )
    }
    return this.props.children
  }
}
