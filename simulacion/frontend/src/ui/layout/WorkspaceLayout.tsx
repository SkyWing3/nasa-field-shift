import type { ReactNode } from 'react';

import styles from './WorkspaceLayout.module.css';

interface WorkspaceLayoutProps {
  readonly topBar: ReactNode;
  readonly sidePanel: ReactNode;
  readonly scene: ReactNode;
}

/** Estructura del espacio de trabajo: barra superior, panel lateral y área de escena. */
export function WorkspaceLayout({ topBar, sidePanel, scene }: WorkspaceLayoutProps) {
  return (
    <div className={styles.layout}>
      <div className={styles.top}>{topBar}</div>
      <div className={styles.side}>{sidePanel}</div>
      <main className={styles.scene} aria-label="Escena 3D">
        {scene}
      </main>
    </div>
  );
}
