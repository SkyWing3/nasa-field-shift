import { useId } from 'react';

import styles from '../AssetViewer.module.css';

interface SegmentedOption<T> {
  readonly value: T;
  readonly label: string;
  readonly disabled?: boolean;
}

interface SegmentedProps<T> {
  readonly label: string;
  readonly value: T;
  readonly options: readonly SegmentedOption<T>[];
  readonly onChange: (value: T) => void;
  readonly testId?: string;
}

export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  testId,
}: SegmentedProps<T>) {
  return (
    <div className={styles.segmented} role="group" aria-label={label} data-testid={testId}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          className={styles.segment}
          aria-pressed={option.value === value}
          disabled={option.disabled}
          onClick={() => {
            onChange(option.value);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

interface SliderProps {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly unit?: string;
  readonly onChange: (value: number) => void;
  readonly disabled?: boolean;
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  unit = '',
  onChange,
  disabled,
}: SliderProps) {
  const id = useId();
  const decimals = step < 1 ? Math.min(2, String(step).split('.')[1]?.length ?? 0) : 0;
  return (
    <div className={styles.slider}>
      <label htmlFor={id} className={styles.sliderLabel}>
        <span>{label}</span>
        <output htmlFor={id} className={styles.sliderValue}>
          {value.toLocaleString('es-ES', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          })}
          {unit}
        </output>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          onChange(Number(event.target.value));
        }}
      />
    </div>
  );
}

interface ToggleProps {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly testId?: string;
}

export function Toggle({ label, checked, onChange, testId }: ToggleProps) {
  return (
    <label className={styles.toggle} data-testid={testId}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
      />
      <span className={styles.toggleTrack} aria-hidden="true" />
      <span>{label}</span>
    </label>
  );
}
