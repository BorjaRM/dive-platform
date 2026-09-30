import type { ComponentProps, HTMLAttributes } from 'react';
import styles from './controls.module.css';

type NativeProps<Props> = Omit<Props, 'className' | 'style' | 'color'>;

export function Button({
  variant = 'primary',
  size = 'default',
  type = 'button',
  ...props
}: NativeProps<ComponentProps<'button'>> & {
  variant?: 'primary' | 'secondary';
  size?: 'default' | 'compact';
}) {
  return (
    <button
      {...props}
      type={type}
      className={styles.button}
      data-variant={variant}
      data-size={size}
    />
  );
}

export function Input(props: NativeProps<ComponentProps<'input'>>) {
  return <input {...props} className={styles.input} />;
}

export function Select(props: NativeProps<ComponentProps<'select'>>) {
  return <select {...props} className={styles.select} />;
}

export function Badge({
  variant = 'neutral',
  ...props
}: NativeProps<ComponentProps<'span'>> & {
  variant?: 'count' | 'neutral' | 'success' | 'warning';
}) {
  return <span {...props} className={styles.badge} data-variant={variant} />;
}

export function Notice({
  as: Element = 'div',
  variant = 'panel',
  tone = 'warning',
  ...props
}: NativeProps<HTMLAttributes<HTMLElement>> & {
  as?: 'div' | 'p';
  variant?: 'panel' | 'inline';
  tone?: 'warning' | 'success';
}) {
  return (
    <Element
      {...props}
      className={styles.notice}
      data-variant={variant}
      data-tone={tone}
    />
  );
}
