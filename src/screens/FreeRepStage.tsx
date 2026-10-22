import { useMemo, useRef, useState } from 'react';
import { usePoseFrames } from '../components/CameraView';
import { Icon } from '../components/Icon';
import { RepDial, setDial } from '../components/RepDial';
import { EXERCISES, type ExerciseId } from '../conditioning/exercises';
import type { FreeResult } from '../conditioning/summary';
import { createCounter, type Tracking } from '../reps/createCounter';
import { isMuted, say, setMuted } from '../training/sounds';
import './RepStage.css';

/** Hide brief tracking dropouts; only warn when tracking is lost for this long. */
const WARN_MS = 400;
const HINT_MS = 1600;

const fmt = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

interface Props {
  exercise: ExerciseId;
  onFinish: (result: FreeResult) => void;
}

/** Free practice: count one exercise until the athlete taps Finish. Every rep is spoken aloud. */
export function FreeRepStage({ exercise, onFinish }: Props) {
  const def = EXERCISES[exercise];
  const counter = useMemo(() => createCounter(exercise), [exercise]);
  const [reps, setReps] = useState(0);
  const [partials, setPartials] = useState(0);
  const [warning, setWarning] = useState<{ tracking: Tracking; text: string } | null>(null);
  const [hint, setHint] = useState<{ text: string; key: number } | null>(null);
  const [muted, setMutedState] = useState(isMuted);
  const fillRef = useRef<SVGCircleElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const paceRef = useRef<HTMLSpanElement>(null);
  const startRef = useRef<number | null>(null);
  const repTimes = useRef<number[]>([]);
  const lostSinceRef = useRef<number | null>(null);
  const warningRef = useRef<Tracking>('ok');
  const hintTimer = useRef(0);
  const finishedRef = useRef(false);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  usePoseFrames((frame) => {
    if (finishedRef.current) return;
    const now = frame?.timestamp ?? performance.now();
    startRef.current ??= now;
    const u = counter.push(frame, now);

    // Tracking warnings, debounced so a single dropped frame never flashes a message.
    if (u.tracking !== 'ok') lostSinceRef.current ??= now;
    else lostSinceRef.current = null;
    const warn: Tracking = lostSinceRef.current !== null && now - lostSinceRef.current > WARN_MS ? u.tracking : 'ok';
    if (warn !== warningRef.current) {
      warningRef.current = warn;
      setWarning(warn === 'ok' ? null : { tracking: warn, text: warn === 'lost' ? "Can't see you" : (u.hint ?? 'Get into position') });
    }

    if (u.event?.kind === 'rep') {
      repTimes.current.push(u.event.t - startRef.current);
      setReps(u.reps);
      if (u.reps % def.countEvery === 0) say(String(u.reps));
    } else if (u.event?.kind === 'partial') {
      setPartials(u.partials);
    }
    if (u.hint && u.tracking === 'ok') {
      setHint({ text: u.hint, key: now });
      clearTimeout(hintTimer.current);
      hintTimer.current = window.setTimeout(() => setHint(null), HINT_MS);
    }

    // Per-frame numbers go straight to the DOM.
    setDial(fillRef.current, u.progress);
    if (timeRef.current) timeRef.current.textContent = fmt(now - startRef.current);
    const times = repTimes.current;
    if (paceRef.current) {
      const span = times.length >= 2 ? times[times.length - 1] - times[0] : 0;
      paceRef.current.textContent = span > 0 ? String(Math.round(((times.length - 1) / span) * 60000)) : '–';
    }
  });

  const finish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const end = performance.now();
    onFinishRef.current({
      exercise,
      reps,
      partials,
      repTimes: repTimes.current,
      startTime: startRef.current ?? end,
      endTime: end,
    });
  };
  const toggleMute = () => {
    setMuted(!muted);
    setMutedState(!muted);
  };

  return (
    <div className="rep is-free">
      <div className="rep-top">
        <span className="label">Free practice</span>
        <strong className="display rep-exercise">
          <Icon name={def.icon} className="rep-exercise-icon" />
          {def.label}
        </strong>
      </div>

      <div className="rep-center">
        <RepDial reps={reps} caption={reps === 1 ? 'rep' : 'reps'} fillRef={fillRef} />
        <div className="rep-toast-slot">
          {warning ? (
            <div className="training-toast reveal" key={warning.tracking}>
              <span className="label">{warning.tracking === 'lost' ? 'Paused' : 'Position'}</span>
              <strong className="h2">{warning.text}</strong>
            </div>
          ) : hint ? (
            <div className="training-toast is-wrong" key={hint.key}>
              <strong className="h2">{hint.text}</strong>
            </div>
          ) : (
            <span className="label practice-listening">
              <i /> Counting
            </span>
          )}
        </div>
      </div>

      <footer className="rep-hud">
        <div className="hud-stat">
          <span className="label">Time</span>
          <strong className="display">
            <span ref={timeRef}>0:00</span>
          </strong>
        </div>
        <div className="hud-stat">
          <span className="label">Pace</span>
          <strong className="display">
            <span ref={paceRef}>–</span>
            <small>/min</small>
          </strong>
        </div>
        {def.id !== 'JUMP_ROPE' && (
          <div className="hud-stat">
            <span className="label">Partial</span>
            <strong className="display">{partials}</strong>
          </div>
        )}
        <div className="wk-actions">
          <button className="btn btn-ghost" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'}>
            {muted ? 'Sound off' : 'Sound on'}
          </button>
          <button className="btn btn-primary" onClick={finish}>
            Finish
          </button>
        </div>
      </footer>
    </div>
  );
}
