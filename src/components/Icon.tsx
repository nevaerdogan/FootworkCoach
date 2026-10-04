// Single line-icon set (24px grid, 1.75 stroke). Add icons here; don't mix libraries.
const PATHS = {
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  arrowLeft: 'M19 12H5M11 6l-6 6 6 6',
  arrowUp: 'M12 19V5M6 11l6-6 6 6',
  arrowDown: 'M12 5v14M6 13l6 6 6-6',
  arrowUpLeft: 'M17 17L7 7M7 15V7h8',
  arrowUpRight: 'M7 17L17 7M9 7h8v8',
  arrowDownLeft: 'M17 7L7 17M7 9v8h8',
  arrowDownRight: 'M7 7l10 10M17 9v8H9',
  jab: 'M3 12h7M14 8.5h3.5a3.5 3.5 0 0 1 0 7H14a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2z',
  cross: 'M3 10h7M3 14h7M14 8.5h3.5a3.5 3.5 0 0 1 0 7H14a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2z',
  switch: 'M8 4v14M5 15l3 3 3-3M16 20V6M13 9l3-3 3 3',
  shift: 'M12 19V6M7 11l5-5 5 5M6 19h3M15 19h3',
  bounce: 'M3 15c1.5-5 3.5-5 5 0s3.5 5 5 0 3.5-5 5 0M8 20h8',
  dashUp: 'M6 12l6-6 6 6M6 18l6-6 6 6',
  dashDown: 'M6 6l6 6 6-6M6 12l6 6 6-6',
  camera: 'M3 8h3l2-3h8l2 3h3v11H3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  close: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  shuffle: 'M4 7h3.5c4 0 5 10 9 10H20M4 17h3.5c1.6 0 2.7-1.6 3.6-3.5M16.5 7H20M17 4l3 3-3 3M17 14l3 3-3 3',
  play: 'M8 5.5v13l10.5-6.5z',
  rotateLeft: 'M4.6 9A8 8 0 1 1 4 13M4 4v5h5',
  rotateRight: 'M19.4 9A8 8 0 1 0 20 13M20 4v5h-5',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return (
    <svg
      className={`icon icon-${name} ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
