import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react';

import styles from './Button.module.css';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'small' | 'medium' | 'large';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
}

export function Button({
  variant = 'secondary',
  size = 'medium',
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = [
    styles.button,
    styles[variant],
    size === 'medium' ? undefined : styles[size],
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return <button type={type} className={classes} {...rest} />;
}

interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly href: string;
}

/** Enlace con el aspecto de un botón (navega a otra página; no ejecuta acciones). */
export function ButtonLink({
  variant = 'secondary',
  size = 'medium',
  className,
  ...rest
}: ButtonLinkProps) {
  const classes = [
    styles.button,
    styles[variant],
    size === 'medium' ? undefined : styles[size],
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return <a className={classes} {...rest} />;
}
