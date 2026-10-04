import { useMemo, useRef, useState } from 'react';
import { usePoseFrames } from '../components/CameraView';
import { armDebug, debugInfo, isDebugMode } from '../components/DebugPanel';
import { Icon } from '../components/Icon';
import { MovementSequence } from '../components/MovementSequence';
import { Stinger } from '../components/Stinger';
import type { BaselineState } from '../footwork/baseline';
import { MotionAnalyzer } from '../footwork/MotionAnalyzer';
import { detectionCandidates, MOVEMENTS, type MovementId } from '../movements';
import { bell, beep, isMuted, say, setMuted } from '../training/sounds';
import { workoutMoves, type Workout } from '../training/workouts';
import { WorkoutSession, type Rep, type WorkoutPhase, type WorkoutResult } from '../training/WorkoutSession';
import './WorkoutStage.css';

interface Props {
  baseline: BaselineState;
  workout: Workout;
  onComplete: (result: WorkoutResult) => void;
}

interface View {
  phase: WorkoutPhase;
  round: number;
  block: number;
  expected: MovementId | null;
  upcoming: MovementId | null;
  reps: number;
  correct: number;
  roundReps: number;
  roundCorrect: number;
  lastRep: Rep | null;
}

const LOST_WARNING_MS = 400;
const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Timed workout on the camera: round clock, current move, rest screens, sound cues. */
export function WorkoutStage({ baseline, workout, onComplete }: Props) {
  const moves = useMemo(() => workoutMoves(workout), [workout]);
  const analyzer = useMemo(
    () => new MotionAnalyzer(baseline, detectionCandidates(moves), moves.some((id) => MOVEMENTS[id].kind === 'punch')),
    [baseline, moves],
  );
  const session = useMemo(() => new WorkoutSession(workout), [workout]);
  const [view, setView] = useState<View>({
    phase: 'ready',
    round: 0,
    block: 0,
    expected: null,
    upcoming: null,
    reps: 0,
    correct: 0,
    roundReps: 0,
    roundCorrect: 0,
    lastRep: null,
  });
  const [feetLost, setFeetLost] = useState(false);
  const [muted, setMutedState] = useState(isMuted);
  const [roundStinger, setRoundStinger] = useState<number | null>(null);
  const timerRef = useRef<HTMLSpanElement>(null);
  const restTimerRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const startedRef = useRef(false);
  const finishedRef = useRef(false);
  const lastSecondRef = useRef<number | null>(null);
  const lostSinceRef = useRef<number | null>(null);
  const feetLostRef = useRef(false);
  const counts = useRef({ reps: 0, correct: 0, roundReps: 0, roundCorrect: 0 });
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const debug = useMemo(isDebugMode, []);

  const blockName = (i: number) => workout.blocks[i]?.name ?? '';

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
      say(`Round 1. ${blockName(0)}. Get ready.`);
    }
    const u = analyzer.push(frame);
    const st = session.tick(now);

    // Phase changes: sound cues + React state.
    if (st.changed) {
      if (st.phase === 'work') {
        bell();
        if (st.block === 0) setRoundStinger(st.round + 1);
        if (st.block === 0 && st.round > 0) counts.current.roundReps = counts.current.roundCorrect = 0;
      } else if (st.phase === 'rest') {
        say(`Rest. Next, round ${st.round + 1}.`);
      } else if (st.phase === 'switch') {
        say(`Next: ${blockName(st.block)}.`);
      }
      lastSecondRef.current = null;
    }
    if (st.phase === 'done') {
      finish(now, false);
      return;
    }

    // Countdown beeps: last 3 s of every segment, plus a "ten seconds" call in work.
    const sec = Math.ceil(st.remainingMs / 1000);
    if (sec !== lastSecondRef.current) {
      lastSecondRef.current = sec;
      if (sec <= 3 && sec >= 1) beep(sec === 1 ? 990 : 660, 120);
      if (st.phase === 'work' && sec === 10 && st.segmentMs > 20000) say('Ten seconds.');
    }

    // Reps (work only).
    let lastRep: Rep | null = null;
    for (const m of u.movements) {
      const rep = session.onMovement(m);
      if (!rep) continue;
      lastRep = rep;
      const c = counts.current;
      c.reps++;
      c.roundReps++;
      if (rep.correct) {
        c.correct++;
        c.roundCorrect++;
      }
    }

    // Feet visibility warning (the clock keeps running, like a real round).
    if (u.state === 'LOW_CONFIDENCE') lostSinceRef.current ??= now;
    else lostSinceRef.current = null;
    const lost = lostSinceRef.current !== null && now - lostSinceRef.current > LOST_WARNING_MS;
    if (lost !== feetLostRef.current) {
      feetLostRef.current = lost;
      setFeetLost(lost);
    }

    if (st.changed || lastRep) {
      setView({
        phase: st.phase,
        round: st.round,
        block: st.block,
        expected: session.expected,
        upcoming: session.upcoming,
        ...counts.current,
        lastRep: lastRep ?? (st.changed ? null : view.lastRep),
      });
    }

    // Clock + progress, straight to the DOM.
    const text = fmt(st.remainingMs);
    if (timerRef.current) timerRef.current.textContent = text;
    if (restTimerRef.current) restTimerRef.current.textContent = text;
    if (barRef.current) barRef.current.style.transform = `scaleX(${1 - st.remainingMs / st.segmentMs})`;

    if (debug) {
      armDebug(u.arms);
      debugInfo.state = u.state;
      debugInfo.phase = `${st.phase} r${st.round + 1} b${st.block + 1}`;
      debugInfo.expect = session.expected ?? '-';
    }
  });

  const toggleMute = () => {
    setMuted(!muted);
    setMutedState(!muted);
  };

  const { phase, round, block, expected, upcoming, reps, correct, roundReps, roundCorrect, lastRep } = view;
  const current = expected ? MOVEMENTS[expected] : null;
  const accuracy = reps ? Math.round((correct / reps) * 100) : null;
  const overlay = phase === 'ready' || phase === 'rest' || phase === 'switch';
  const nextBlock = phase === 'rest' ? 0 : block;

  return (
    <div className={`wk is-${phase}`}>
      <Stinger play={roundStinger} title={`Round ${roundStinger ?? 1}`} kicker={blockName(0)} />
      <div className="wk-top">
        <div className="wk-round">
          <span className="label">
            Round {round + 1} / {workout.rounds}
          </span>
          <strong className="display wk-block">{blockName(phase === 'rest' ? 0 : block)}</strong>
        </div>
        {workout.blocks.length > 1 && (
          <ol className="wk-blocks" aria-label="Drills this round">
            {workout.blocks.map((b, i) => (
              <li key={b.name} className={i === block ? 'is-on' : i < block ? 'is-done' : ''}>
                {b.name}
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="wk-center">
        {feetLost ? (
          <div className="training-toast reveal" key="lost">
            <span className="label">Keep going</span>
            <strong className="h2">Feet not clearly visible</strong>
          </div>
        ) : (
          current && (
            <div className="wk-move" key={`${round}-${block}-${reps}`}>
              {lastRep && (
                <span className={`wk-rep ${lastRep.correct ? 'is-correct' : 'is-wrong'}`}>
                  <Icon name={lastRep.correct ? 'check' : 'close'} />
                </span>
              )}
              <strong className="display wk-move-name">
                <Icon name={current.icon} className="wk-move-icon" />
                {current.short}
              </strong>
              {upcoming && <span className="label wk-next">Then {MOVEMENTS[upcoming].short}</span>}
            </div>
          )
        )}
      </div>

      <footer className="wk-hud">
        <div className="wk-clock">
          <span className="display wk-time" ref={timerRef}>
            0:00
          </span>
          <span className="wk-bar" aria-hidden="true">
            <i ref={barRef} />
          </span>
        </div>
        <div className="hud-stat">
          <span className="label">Reps</span>
          <strong className="display">{reps}</strong>
        </div>
        <div className="hud-stat">
          <span className="label">Accuracy</span>
          <strong className="display">{accuracy === null ? '–' : `${accuracy}%`}</strong>
        </div>
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
        <div className="wk-overlay reveal" key={`${phase}-${round}-${block}`}>
          <span className="label wk-overlay-label">
            {phase === 'ready' ? 'Get ready' : phase === 'rest' ? 'Rest' : 'Next drill'}
          </span>
          <span className="display wk-overlay-time" ref={restTimerRef}>
            0:00
          </span>
          <strong className="h2">
            {phase === 'rest' ? `Round ${round + 1} · ` : ''}
            {blockName(nextBlock)}
          </strong>
          <MovementSequence items={workout.blocks[nextBlock].pattern} size="sm" />
          {phase === 'rest' && roundReps > 0 && (
            <p className="muted">
              Last round: {roundReps} reps · {Math.round((roundCorrect / roundReps) * 100)}% accuracy
            </p>
          )}
        </div>
      )}
    </div>
  );
}
