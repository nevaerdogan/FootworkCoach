import { useCallback, useEffect, useRef, useState } from 'react';
import { usePoseFrames } from '../components/CameraView';
import { Icon } from '../components/Icon';
import { READINESS_CONFIG } from '../config';
import { assessReadiness, BODY_PARTS, readinessKey, type Guidance, type Readiness } from '../pose/readiness';
import type { PoseFrame } from '../pose/types';

const GUIDANCE: Record<Guidance | 'HOLD' | 'CONFIRMED', { title: string; body: string }> = {
  CONFIRMED: { title: 'Position checked', body: 'Press Continue or Space, then step back into frame.' },
  NO_PERSON: { title: 'Step into frame', body: 'Stand 2–3 m from the camera, facing it.' },
  STEP_BACK: { title: 'Step back', body: 'Step back until your full body is visible.' },
  ADJUST: { title: 'Center yourself', body: 'Move so your whole body is inside the frame.' },
  HOLD: { title: 'Hold still', body: 'Checking your position…' },
  READY: { title: "You're set", body: 'Hold your position — continuing automatically.' },
};

export function SetupStage({ onContinue }: { onContinue: () => void }) {
  const [readiness, setReadiness] = useState<Readiness>(() => assessReadiness(null));
  // `confirmed` latches: once the full body was seen, walking to the keyboard
  // (and leaving the frame) must not disable Continue again.
  const [confirmed, setConfirmed] = useState(false);
  const [holding, setHolding] = useState(false);
  const keyRef = useRef('');
  const readySinceRef = useRef<number | null>(null);
  const confirmedRef = useRef(false);
  const holdingRef = useRef(false);
  const doneRef = useRef(false);
  const onContinueRef = useRef(onContinue);
  onContinueRef.current = onContinue;

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onContinueRef.current();
  }, []);

  // Hands-free alternative: Space / Enter continues once confirmed.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === ' ' || e.key === 'Enter') && confirmedRef.current) {
        e.preventDefault();
        finish();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finish]);

  usePoseFrames((frame: PoseFrame | null) => {
    const r = assessReadiness(frame);
    const key = readinessKey(r);
    if (key !== keyRef.current) {
      keyRef.current = key;
      setReadiness(r);
    }
    const now = performance.now();
    if (r.ready) readySinceRef.current ??= now;
    else readySinceRef.current = null;
    const heldMs = readySinceRef.current === null ? 0 : now - readySinceRef.current;
    const isHolding = heldMs >= READINESS_CONFIG.stableMs;

    if (isHolding && !confirmedRef.current) {
      confirmedRef.current = true;
      setConfirmed(true);
    }
    if (isHolding !== holdingRef.current) {
      holdingRef.current = isHolding;
      setHolding(isHolding);
    }
    if (heldMs >= READINESS_CONFIG.stableMs + READINESS_CONFIG.autoContinueMs) finish();
  });

  const guidance = readiness.ready
    ? holding
      ? GUIDANCE.READY
      : GUIDANCE.HOLD
    : confirmed
      ? GUIDANCE.CONFIRMED
      : GUIDANCE[readiness.guidance];

  return (
    <>
      <div className={`setup-frame ${holding ? 'is-ready' : ''}`} aria-hidden="true">
        <span /><span /><span /><span />
      </div>

      <footer className="session-bottom">
        <div className="session-guidance" key={guidance.title}>
          <h2 className="h2">{guidance.title}</h2>
          <p className="muted">{guidance.body}</p>
        </div>

        <ul className="setup-checks" aria-label="Body tracking">
          {BODY_PARTS.map((p) => (
            <li key={p.id} className={readiness.parts[p.id] ? 'is-on' : ''}>
              <i />
              <span className="label">{p.label}</span>
            </li>
          ))}
        </ul>

        <button
          className={`btn btn-primary session-cta ${holding ? 'is-counting' : ''}`}
          style={{ '--auto-ms': `${READINESS_CONFIG.autoContinueMs}ms` } as React.CSSProperties}
          disabled={!confirmed}
          onClick={finish}
        >
          <span className="session-cta-fill" aria-hidden="true" />
          Continue <Icon name="arrowRight" />
        </button>
      </footer>
    </>
  );
}
