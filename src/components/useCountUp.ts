import { useEffect, useState } from 'react';

/** Counts from 0 to `target` with an ease-out curve (instant when reduced motion is on). */
export function useCountUp(target: number, ms = 1100, delay = 250): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now() + delay;
    const tick = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - start) / ms));
      setValue(Math.round(target * (1 - Math.pow(1 - p, 4))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, delay]);
  return value;
}
