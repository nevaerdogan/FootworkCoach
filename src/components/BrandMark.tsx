/** Logo: two footprints in a fighting stance (lead foot forward). */
const SOLE =
  'M0.6,-13 C4.6,-13 6.6,-8.6 6.2,-3.4 C5.9,0.4 4.4,3.2 4.2,6.4 C4,10 3.6,13 0.2,13 C-3.4,13 -4.2,10.4 -4.4,7.4 C-4.6,4 -6.6,0.6 -6.6,-3.6 C-6.6,-9.2 -3.6,-13 0.6,-13 Z';

export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" className="brand-mark">
      <path d={SOLE} transform="translate(15 15) rotate(-8) scale(0.85)" fill="currentColor" />
      <path d={SOLE} transform="translate(26 26) rotate(-38) scale(-0.85 0.85)" fill="var(--accent)" />
    </svg>
  );
}
