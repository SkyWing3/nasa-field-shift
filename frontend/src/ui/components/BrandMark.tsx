interface BrandMarkProps {
  readonly size?: number;
}

/** Marca de TerraLab: surcos de campo estilizados. */
export function BrandMark({ size = 28 }: BrandMarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="7" fill="#18201b" />
      <g fill="none" strokeWidth="2" strokeLinecap="round">
        <path d="M6 21c4-1.6 8-1.6 10 0s6 1.6 10 0" stroke="#d8b36a" />
        <path d="M6 16c4-1.6 8-1.6 10 0s6 1.6 10 0" stroke="#8fb36c" opacity=".85" />
        <path d="M6 11c4-1.6 8-1.6 10 0s6 1.6 10 0" stroke="#8fb36c" opacity=".5" />
      </g>
    </svg>
  );
}
