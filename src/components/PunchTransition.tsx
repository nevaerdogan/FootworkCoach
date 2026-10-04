import { useEffect, useState } from 'react';
import { Glove } from './Glove';
import './PunchTransition.css';

/** When the glove lands and covers the screen (ms): swap the screen underneath at this moment. */
export const PUNCH_COVER_MS = 430;
const TOTAL_MS = 950;
const SPEED_LINES = 14;

/**
 * Jab transition: a glove shoots at the screen, impact shake and speed lines, the glove fills
 * the view, and the next screen opens out of it. Play by changing `play`.
 */
export function PunchTransition({ play }: { play: number | null }) {
  const [run, setRun] = useState<number | null>(null);

  useEffect(() => {
    if (play === null) return;
    setRun(play);
    const shake = setTimeout(() => {
      document.body.classList.add('impact-shake');
      setTimeout(() => document.body.classList.remove('impact-shake'), 320);
    }, 210);
    const end = setTimeout(() => setRun(null), TOTAL_MS);
    return () => {
      clearTimeout(shake);
      clearTimeout(end);
      document.body.classList.remove('impact-shake');
    };
  }, [play]);

  if (run === null) return null;
  return (
    <div className="punch" key={run} aria-hidden="true">
      <div className="punch-lines">
        {Array.from({ length: SPEED_LINES }, (_, i) => (
          <i key={i} style={{ transform: `rotate(${(360 / SPEED_LINES) * i}deg)` }} />
        ))}
      </div>
      <div className="punch-glove">
        <Glove tone="accent" />
      </div>
      <div className="punch-cover" />
    </div>
  );
}

/** Reduced motion: no punch, just navigate. */
export const punchAllowed = () => !matchMedia('(prefers-reduced-motion: reduce)').matches;
