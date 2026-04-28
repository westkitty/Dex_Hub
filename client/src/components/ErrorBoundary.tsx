import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Unexpected rendering failure.',
    };
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error('[DexHub] UI boundary captured:', error, info);
  }

  reset = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <main className="min-h-screen flex items-center justify-center p-6">
          <section className="glass-card w-full max-w-md p-5 space-y-3" role="alert" aria-live="assertive">
            <div className="flex items-center gap-2 text-red-300">
              <AlertTriangle className="w-4 h-4" />
              <h2 className="text-sm font-semibold">Application Error</h2>
            </div>
            <p className="text-xs text-gray-400 break-words">{this.state.message}</p>
            <button
              type="button"
              onClick={this.reset}
              className="btn-action text-accent-primary border-accent-primary/30 bg-accent-primary/10 hover:bg-accent-primary/20"
            >
              <RotateCcw className="w-3 h-3" />
              Retry
            </button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}
