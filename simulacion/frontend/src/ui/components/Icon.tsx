import type { SVGProps } from 'react';

export type IconName =
  | 'prepare-soil'
  | 'sow'
  | 'irrigate'
  | 'harvest'
  | 'calendar'
  | 'refresh'
  | 'alert'
  | 'layers'
  | 'map'
  | 'home'
  | 'search'
  | 'pin'
  | 'draw'
  | 'speaker'
  | 'speaker-off';

/** Trazos de 24×24 dibujados para TerraLab (sin dependencias de librerías de iconos). */
const PATHS: Readonly<Record<IconName, readonly string[]>> = {
  speaker: [
    'M4 9.5h3.5L12 5.5v13l-4.5-4H4Z',
    'M15.5 9a4 4 0 0 1 0 6',
    'M18 6.5a7.5 7.5 0 0 1 0 11',
  ],
  'speaker-off': ['M4 9.5h3.5L12 5.5v13l-4.5-4H4Z', 'm16 9.5 5 5', 'M21 9.5l-5 5'],
  'prepare-soil': ['M4 19h16', 'M5 15c2.5-1.2 4.5-1.2 7 0s4.5 1.2 7 0', 'M12 3v8', 'M9 8l3 3 3-3'],
  sow: [
    'M12 21v-7',
    'M12 14c0-4 2.5-6.5 6.5-6.5 0 4-2.5 6.5-6.5 6.5Z',
    'M12 16c0-3-2-5-5-5 0 3 2 5 5 5Z',
  ],
  irrigate: [
    'M12 3.5c3 3.6 5.5 6.6 5.5 9.8a5.5 5.5 0 0 1-11 0c0-3.2 2.5-6.2 5.5-9.8Z',
    'M9.5 14a2.5 2.5 0 0 0 2.5 2.5',
  ],
  harvest: [
    'M12 21V8',
    'M12 8c-1.6-1-2.4-2.6-2.4-4.5 1.6.9 2.4 2.5 2.4 4.5Z',
    'M12 8c1.6-1 2.4-2.6 2.4-4.5-1.6.9-2.4 2.5-2.4 4.5Z',
    'M12 12.5c-1.8-.6-3-2-3.4-3.9 1.8.5 3 1.9 3.4 3.9Z',
    'M12 12.5c1.8-.6 3-2 3.4-3.9-1.8.5-3 1.9-3.4 3.9Z',
    'M12 17c-1.8-.6-3-2-3.4-3.9 1.8.5 3 1.9 3.4 3.9Z',
    'M12 17c1.8-.6 3-2 3.4-3.9-1.8.5-3 1.9-3.4 3.9Z',
  ],
  calendar: ['M5 6h14v14H5z', 'M5 10h14', 'M9 3.5V7', 'M15 3.5V7'],
  refresh: ['M19 12a7 7 0 1 1-2.05-4.95', 'M19 4.5V9h-4.5'],
  alert: ['M12 4 21 19.5H3Z', 'M12 10v4.5', 'M12 17.2v.3'],
  layers: [
    'm12 4 8.5 4.5L12 13 3.5 8.5Z',
    'm3.5 12.5 8.5 4.5 8.5-4.5',
    'm3.5 16.5 8.5 4.5 8.5-4.5',
  ],
  map: ['M9 5 3.5 7v12L9 17l6 2 5.5-2V5L15 7Z', 'M9 5v12', 'M15 7v12'],
  home: ['M4 11 12 4l8 7', 'M6.5 9.5V20h11V9.5'],
  search: ['M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Z', 'M20 20l-4.8-4.8'],
  pin: [
    'M12 21s-6.5-5.7-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 15.3 12 21 12 21Z',
    'M12 12.3a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  ],
  draw: ['M6 3v15h15', 'M3 6h15v15', 'M10 10h4v4h-4z'],
};

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  readonly name: IconName;
  readonly size?: number;
}

export function Icon({ name, size = 18, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
