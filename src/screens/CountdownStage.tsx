import { useEffect, useRef, useState } from 'react';
import { TRAINING_CONFIG } from '../config';
import { beep, bell, say } from '../training/sounds';

const C = TRAINING_CONFIG;
const BEATS: { text: string; ms: number }[] = [
  { text: 'Your turn', ms: C.countdownIntroMs },
  { text: '3', ms: C.countdownStepMs },
  { text: '2', ms: C.countdownStepMs },
  { text: '1', ms: C.countdownStepMs },
  { text: 'GO', ms: C.countdownGoMs },
];

/**
 * Your turn → 3 → 2 → 1 → GO. Calls onGo when GO ends; analysis starts then.
 * With `sound`, every beat is audible (for athletes who are already face down on the floor).
 */
export function CountdownStage({ onGo, sound = false }: { onGo: () => void; sound?: boolean }) {
  const [beat, setBeat] = useState(0);
  const onGoRef = useRef(onGo);
  onGoRef.current = onGo;

  useEffect(() => {
    if (sound) {
      const b = BEATS[beat];
      if (b.text === 'GO') bell();
      else if (/^\d$/.test(b.text)) beep(660, 120);
      else say(b.text);
    }
    const id = setTimeout(() => {
      if (beat < BEATS.length - 1) setBeat(beat + 1);
      else onGoRef.current();
    }, BEATS[beat].ms);
    return () => clearTimeout(id);
  }, [beat, sound]);

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
