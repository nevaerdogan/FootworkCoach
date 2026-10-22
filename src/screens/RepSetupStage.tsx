import { useCallback, useEffect, useRef, useState } from 'react';
import { usePoseFrames } from '../components/CameraView';
import { Icon } from '../components/Icon';
import { useMediaQuery } from '../components/useMediaQuery';
import { EXERCISES, type ExerciseId } from '../conditioning/exercises';
import { READINESS_CONFIG } from '../config';
import { assessExerciseReadiness, BODY_PARTS, readinessKey, type Guidance, type Readiness } from '../pose/readiness';

const GUIDANCE: Record<Guidance | 'HOLD' | 'CONFIRMED', { title: string; body: string }> = {
  CONFIRMED: { title: 'Position checked', body: 'Press Continue, then get into position.' },
  NO_PERSON: { title: 'Step into frame', body: 'Stand on the spot where you will exercise, 2–3 m from the camera.' },
  STEP_BACK: { title: 'Step back', body: 'Move back until your legs and feet are in the frame.' },
  ADJUST: { title: 'Center yourself', body: 'Move so your whole body is inside the frame.' },
  HOLD: { title: 'Hold still', body: 'Checking your position…' },
  READY: { title: "You're set", body: 'Hold your position — continuing automatically.' },
};

interface Props {
  exercise: ExerciseId;
  onContinue: () => void;
}

/**
 * Camera placement for a conditioning exercise: where to put the phone, then a framing check
 * while the athlete stands on the spot. Side-on exercises only need one side of the body visible.
 */
export function RepSetupStage({ exercise, onContinue }: Props) {
  const def = EXERCISES[exercise];
  const [readiness, setReadiness] = useState<Readiness>(() => assessExerciseReadiness(null, def.parts, def.view));
  const [confirmed, setConfirmed] = useState(false);
  const [holding, setHolding] = useState(false);
  const keyRef = useRef('');
  const readySinceRef = useRef<number | null>(null);
  const confirmedRef = useRef(false);
  const holdingRef = useRef(false);
  const doneRef = useRef(false);
  const onContinueRef = useRef(onContinue);
  onContinueRef.current = onContinue;
  // A lying body is wide: on a phone, the camera must be in landscape to see all of it.
  const portraitPhone = useMediaQuery('(orientation: portrait) and (max-width: 900px)');

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onContinueRef.current();
  }, []);

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

  usePoseFrames((frame) => {
    const r = assessExerciseReadiness(frame, def.parts, def.view);
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

  const guidance = readiness.ready ? (holding ? GUIDANCE.READY : GUIDANCE.HOLD) : confirmed ? GUIDANCE.CONFIRMED : GUIDANCE[readiness.guidance];
  const parts = BODY_PARTS.filter((p) => def.parts.includes(p.id));

  return (
    <>
      <div className={`setup-frame ${holding ? 'is-ready' : ''}`} aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>

      <footer className="session-bottom">
        <div className="session-guidance" key={guidance.title}>
          <span className="label rep-setup-kicker">
            <Icon name={def.icon} /> {def.label} · {def.setup.title}
          </span>
          <h2 className="h2">{guidance.title}</h2>
          <p className="muted">{guidance.body}</p>
          <p className="rep-setup-how muted">
            {def.setup.body}
            {def.view === 'side' && portraitPhone && <strong> Turn your phone sideways so it can see all of you lying down.</strong>}
          </p>
        </div>

        <ul className="setup-checks" aria-label="Body tracking">
          {parts.map((p) => (
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
