import { useId, useState } from 'react';

import styles from './Location.module.css';

interface NumberFieldProps {
  readonly label: string;
  readonly value: number;
  readonly unit: string;
  readonly min: number;
  readonly max: number;
  readonly onCommit: (value: number) => void;
  readonly testId?: string;
}

const display = (value: number): string => String(Math.round(value * 10) / 10);

/**
 * Campo numérico que admite texto intermedio mientras se escribe (vacío, "4", "400,"): solo
 * comunica valores numéricos completos. Acepta coma o punto decimal.
 */
export function NumberField({ label, value, unit, min, max, onCommit, testId }: NumberFieldProps) {
  const id = useId();
  const [text, setText] = useState(display(value));
  const [synced, setSynced] = useState(value);
  // Si el valor cambia desde fuera (mapa, región demostrativa), se refleja en el campo.
  if (synced !== value) {
    setSynced(value);
    if (Number(text.replace(',', '.')) !== value) setText(display(value));
  }
  return (
    <label className={styles.numberField} htmlFor={id}>
      <span>{label}</span>
      <span className={styles.numberInput}>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={text}
          data-testid={testId}
          aria-describedby={`${id}-range`}
          onChange={(event) => {
            const next = event.target.value;
            setText(next);
            const parsed = Number(next.replace(',', '.'));
            if (next.trim() !== '' && Number.isFinite(parsed)) onCommit(parsed);
          }}
        />
        <span aria-hidden="true">{unit}</span>
      </span>
      <span id={`${id}-range`} className={styles.fieldHint}>
        {min.toLocaleString('es-ES')}–{max.toLocaleString('es-ES')} {unit}
      </span>
    </label>
  );
}
