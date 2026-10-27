import { useMemo, useRef, useState } from 'react';
import { usePoseFrames } from '../components/CameraView';
import { Icon } from '../components/Icon';
import { RepDial, setDial } from '../components/RepDial';
import { RepFeedbackToast, useRepFeedback } from '../components/RepFeedback';
import { EXERCISES, type ExerciseId } from '../conditioning/exercises';
import type { FreeResult } from '../conditioning/summary';
import { clockElapsed } from '../format';
import { createCounter } from '../reps/createCounter';
import { isMuted, say, setMuted } from '../training/sounds';
import './RepStage.css';

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
  const { warning, hint, track } = useRepFeedback();
  const [muted, setMutedState] = useState(isMuted);
  const fillRef = useRef<SVGCircleElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const paceRef = useRef<HTMLSpanElement>(null);
  const startRef = useRef<number | null>(null);
  const repTimes = useRef<number[]>([]);
  const finishedRef = useRef(false);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  usePoseFrames((frame) => {
    if (finishedRef.current) return;
    const now = frame?.timestamp ?? performance.now();
    startRef.current ??= now;
    const u = counter.push(frame, now);
    track(u, now);

    if (u.event?.kind === 'rep') {
      repTimes.current.push(u.event.t - startRef.current);
      setReps(u.reps);
      if (u.reps % def.countEvery === 0) say(String(u.reps));
    } else if (u.event?.kind === 'partial') {
      setPartials(u.partials);
    }

    // Per-frame numbers go straight to the DOM.
    setDial(fillRef.current, u.progress);
    if (timeRef.current) timeRef.current.textContent = clockElapsed(now - startRef.current);
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
          <RepFeedbackToast
            warning={warning}
            hint={hint}
            lostLabel="Paused"
            idle={
              <span className="label practice-listening">
                <i /> Counting
              </span>
            }
          />
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
