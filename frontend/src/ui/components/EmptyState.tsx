import type { ReactNode } from 'react';

import styles from './Feedback.module.css';
import { Icon, type IconName } from './Icon';

interface EmptyStateProps {
  readonly icon: IconName;
  readonly title: string;
  readonly children: ReactNode;
}

export function EmptyState({ icon, title, children }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <p className={styles.emptyHeader}>
        <Icon name={icon} size={16} />
        {title}
      </p>
      <p className={styles.emptyBody}>{children}</p>
    </div>
  );
}
