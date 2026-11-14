import { Component, type ReactNode } from 'react';

interface StageBoundaryProps {
  readonly children: ReactNode;
  readonly onError: (message: string) => void;
}

interface StageBoundaryState {
  readonly failed: boolean;
}

/**
 * Límite de errores apto para el árbol de R3F: no renderiza DOM. El error se comunica al store
 * y la interfaz lo muestra fuera del lienzo, sin perder el contexto WebGL.
 */
export class StageBoundary extends Component<StageBoundaryProps, StageBoundaryState> {
  override state: StageBoundaryState = { failed: false };

  static getDerivedStateFromError(): StageBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    this.props.onError(error instanceof Error ? error.message : String(error));
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}
