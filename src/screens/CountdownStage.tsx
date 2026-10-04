import { useEffect, useRef, useState } from 'react';
import { TRAINING_CONFIG } from '../config';

const C = TRAINING_CONFIG;
const BEATS: { text: string; ms: number }[] = [
  { text: 'Your turn', ms: C.countdownIntroMs },
  { text: '3', ms: C.countdownStepMs },
  { text: '2', ms: C.countdownStepMs },
  { text: '1', ms: C.countdownStepMs },
  { text: 'GO', ms: C.countdownGoMs },
];

/** Your turn → 3 → 2 → 1 → GO. Calls onGo when GO ends; analysis starts then. */
export function CountdownStage({ onGo }: { onGo: () => void }) {
  const [beat, setBeat] = useState(0);
  const onGoRef = useRef(onGo);
  onGoRef.current = onGo;

  useEffect(() => {
    const id = setTimeout(() => {
      if (beat < BEATS.length - 1) setBeat(beat + 1);
      else onGoRef.current();
    }, BEATS[beat].ms);
    return () => clearTimeout(id);
  }, [beat]);

  const b = BEATS[beat];
  const isNumber = /^\d$/.test(b.text);
  return (
    <div className="countdown" aria-live="assertive">
      <span key={beat} className={`display countdown-beat ${isNumber ? 'is-number' : ''} ${b.text === 'GO' ? 'is-go' : ''}`}>
        {b.text}
      </span>
    </div>
  );
}
