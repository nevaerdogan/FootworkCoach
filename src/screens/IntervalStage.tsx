import { useMemo, useRef, useState } from 'react';
import { usePoseFrames } from '../components/CameraView';
import { Icon } from '../components/Icon';
import { RepDial, setDial } from '../components/RepDial';
import { Stinger } from '../components/Stinger';
import { EXERCISES, type ExerciseId } from '../conditioning/exercises';
import { IntervalSession, type IntervalPhase, type IntervalPlan, type IntervalResult } from '../conditioning/IntervalSession';
import { createCounter, type ExerciseCounter, type Tracking } from '../reps/createCounter';
import { beep, bell, isMuted, say, setMuted } from '../training/sounds';
import './RepStage.css';

const WARN_MS = 400;
const HINT_MS = 1600;
const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

interface View {
  phase: IntervalPhase;
  round: number;
  index: number;
  exercise: ExerciseId;
  /** Reps in the block in progress. */
  blockReps: number;
  blockPartials: number;
  total: number;
  /** Reps of the block that just ended (shown during rest). */
  lastBlock: { exercise: ExerciseId; reps: number } | null;
}

interface Props {
  plan: IntervalPlan;
  onComplete: (result: IntervalResult) => void;
}

/**
 * Timed conditioning: 45 s blocks with 15 s rest, a fresh counter for every block, reps spoken
 * aloud (the athlete is face down and can't watch the screen), rest overlays that say what comes
 * next and how to get into position.
 */
export function IntervalStage({ plan, onComplete }: Props) {
  const session = useMemo(() => new IntervalSession(plan), [plan]);
  const [view, setView] = useState<View>({
    phase: 'ready',
    round: 0,
    index: 0,
    exercise: plan.exercises[0],
    blockReps: 0,
    blockPartials: 0,
    total: 0,
    lastBlock: null,
  });
  const [warning, setWarning] = useState<{ tracking: Tracking; text: string } | null>(null);
  const [hint, setHint] = useState<{ text: string; key: number } | null>(null);
  const [muted, setMutedState] = useState(isMuted);
  const [roundStinger, setRoundStinger] = useState<number | null>(null);
  const counterRef = useRef<ExerciseCounter | null>(null);
  const fillRef = useRef<SVGCircleElement>(null);
  const timerRef = useRef<HTMLSpanElement>(null);
  const restTimerRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const startedRef = useRef(false);
  const finishedRef = useRef(false);
  const lastSecondRef = useRef<number | null>(null);
  const lostSinceRef = useRef<number | null>(null);
  const warningRef = useRef<Tracking>('ok');
  const hintTimer = useRef(0);
  const counts = useRef({ blockReps: 0, blockPartials: 0, total: 0, lastBlock: null as View['lastBlock'] });
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const finish = (t: number, early: boolean) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (early) session.end(t);
    else {
      bell();
      say('Workout complete. Great work.');
    }
    setTimeout(() => onCompleteRef.current(session.result()), early ? 0 : 900);
  };

  usePoseFrames((frame) => {
    if (finishedRef.current) return;
    const now = frame?.timestamp ?? performance.now();
    if (!startedRef.current) {
      session.start(now);
      startedRef.current = true;
      const first = EXERCISES[plan.exercises[0]];
      say(`Get ready. ${first.voice} first. ${first.position}`);
    }
    const st = session.tick(now);
    const def = EXERCISES[st.exercise];
    const c = counts.current;

    if (st.changed) {
      if (st.phase === 'work') {
        bell();
        say(`${def.label}. Go.`);
        counterRef.current = createCounter(st.exercise);
        c.blockReps = c.blockPartials = 0;
        if (st.index === 0) setRoundStinger(st.round + 1);
      } else if (st.phase === 'rest') {
        counterRef.current = null;
        say(`Rest. Next: ${def.voice}. ${def.position}`);
      }
      lastSecondRef.current = null;
      setWarning(null);
      warningRef.current = 'ok';
      lostSinceRef.current = null;
      setDial(fillRef.current, 0);
    }
    if (st.phase === 'done') {
      finish(now, false);
      return;
    }

    // Countdown beeps in the last 3 s of every segment; a "ten seconds" call during work.
    const sec = Math.ceil(st.remainingMs / 1000);
    if (sec !== lastSecondRef.current) {
      lastSecondRef.current = sec;
      if (sec <= 3 && sec >= 1) beep(sec === 1 ? 990 : 660, 120);
      if (st.phase === 'work' && sec === 10 && st.segmentMs > 20000) say('Ten seconds.');
    }

    let changed = st.changed;
    const counter = counterRef.current;
    if (st.phase === 'work' && counter) {
      const u = counter.push(frame, now);
      if (u.tracking !== 'ok') lostSinceRef.current ??= now;
      else lostSinceRef.current = null;
      const warn: Tracking = lostSinceRef.current !== null && now - lostSinceRef.current > WARN_MS ? u.tracking : 'ok';
      if (warn !== warningRef.current) {
        warningRef.current = warn;
        setWarning(warn === 'ok' ? null : { tracking: warn, text: warn === 'lost' ? "Can't see you" : (u.hint ?? 'Get into position') });
      }
      if (u.event) {
        session.onRep(u.event.kind, now);
        if (u.event.kind === 'rep') {
          c.blockReps = u.reps;
          c.total++;
          if (u.reps % def.countEvery === 0) say(String(u.reps));
        } else c.blockPartials = u.partials;
        changed = true;
      }
      if (u.hint && u.tracking === 'ok') {
        setHint({ text: u.hint, key: now });
        clearTimeout(hintTimer.current);
        hintTimer.current = window.setTimeout(() => setHint(null), HINT_MS);
      }
      setDial(fillRef.current, u.progress);
    }
    if (st.changed && st.phase === 'rest') {
      const prev = session.schedule[session.schedule.indexOf(session.current) - 1];
      c.lastBlock = prev ? { exercise: prev.exercise, reps: c.blockReps } : null;
    }
    if (changed) setView({ phase: st.phase, round: st.round, index: st.index, exercise: st.exercise, ...c });

    const text = fmt(st.remainingMs);
    if (timerRef.current) timerRef.current.textContent = text;
    if (restTimerRef.current) restTimerRef.current.textContent = text;
    if (barRef.current) barRef.current.style.transform = `scaleX(${1 - st.remainingMs / st.segmentMs})`;
  });

  const toggleMute = () => {
    setMuted(!muted);
    setMutedState(!muted);
  };

  const { phase, round, index, exercise, blockReps, blockPartials, total, lastBlock } = view;
  const def = EXERCISES[exercise];
  const overlay = phase === 'ready' || phase === 'rest';

  return (
    <div className={`rep is-timed is-${phase}`}>
      <Stinger play={roundStinger} title={`Round ${roundStinger ?? 1}`} kicker={EXERCISES[plan.exercises[0]].label} />
      <div className="rep-top">
        <span className="label">
          Round {round + 1} / {plan.rounds}
        </span>
        <strong className="display rep-exercise">
          <Icon name={def.icon} className="rep-exercise-icon" />
          {def.label}
        </strong>
        {plan.exercises.length > 1 && (
          <ol className="rep-blocks" aria-label="Exercises this round">
            {plan.exercises.map((id, i) => (
              <li key={id} className={i === index ? 'is-on' : i < index ? 'is-done' : ''}>
                {EXERCISES[id].short}
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="rep-center">
        <RepDial reps={blockReps} caption={blockReps === 1 ? 'rep' : 'reps'} fillRef={fillRef} />
        <div className="rep-toast-slot">
          {warning ? (
            <div className="training-toast reveal" key={warning.tracking}>
              <span className="label">{warning.tracking === 'lost' ? 'Keep going' : 'Position'}</span>
              <strong className="h2">{warning.text}</strong>
            </div>
          ) : hint ? (
            <div className="training-toast is-wrong" key={hint.key}>
              <strong className="h2">{hint.text}</strong>
            </div>
          ) : null}
        </div>
      </div>

      <footer className="rep-hud">
        <div className="wk-clock">
          <span className="display wk-time" ref={timerRef}>
            0:00
          </span>
          <span className="wk-bar" aria-hidden="true">
            <i ref={barRef} />
          </span>
        </div>
        <div className="hud-stat">
          <span className="label">Total</span>
          <strong className="display">{total}</strong>
        </div>
        {exercise !== 'JUMP_ROPE' && (
          <div className="hud-stat">
            <span className="label">Partial</span>
            <strong className="display">{blockPartials}</strong>
          </div>
        )}
        <div className="wk-actions">
          <button className="btn btn-ghost" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'}>
            {muted ? 'Sound off' : 'Sound on'}
          </button>
          <button className="btn btn-ghost" onClick={() => finish(performance.now(), true)}>
            End
          </button>
        </div>
      </footer>

      {overlay && (
        <div className="wk-overlay reveal" key={`${phase}-${round}-${index}`}>
          <span className="label wk-overlay-label">{phase === 'ready' ? 'Get ready' : 'Rest'}</span>
          <span className="display wk-overlay-time" ref={restTimerRef}>
            0:00
          </span>
          <strong className="h2">
            {phase === 'rest' ? `Next · ` : ''}
            {def.label}
          </strong>
          <p className="rep-position muted">{def.position}</p>
          {phase === 'rest' && lastBlock && (
            <p className="muted">
              Last block: {lastBlock.reps} {EXERCISES[lastBlock.exercise].label.toLowerCase()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
