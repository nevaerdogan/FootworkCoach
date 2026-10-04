import { useEffect, useMemo, useRef, useState } from 'react';
import { usePoseFrames } from '../components/CameraView';
import { armDebug, debugInfo, isDebugMode } from '../components/DebugPanel';
import { Icon } from '../components/Icon';
import { MovementSequence, type SequenceStatus } from '../components/MovementSequence';
import { TRAINING_CONFIG } from '../config';
import type { BaselineState } from '../footwork/baseline';
import { MotionAnalyzer } from '../footwork/MotionAnalyzer';
import { detectionCandidates, MOVEMENTS, type MovementId } from '../movements';
import { TrainingSession, type AttemptRecord, type SessionResult } from '../training/TrainingSession';

interface Props {
  baseline: BaselineState;
  combination: MovementId[];
  onComplete: (result: SessionResult) => void;
}

const LOST_WARNING_MS = 300;
const fmtTime = (ms: number) => {
  const s = Math.max(0, ms) / 1000;
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`;
};

/** Live training: camera is the hero; the HUD stays out of the way. */
export function TrainingStage({ baseline, combination, onComplete }: Props) {
  // Created when GO ends, so the reference stance is wherever the user stands at GO.
  // Punch detection only runs in rounds that contain punches (no stray jabs in footwork rounds).
  const analyzer = useMemo(
    () =>
      new MotionAnalyzer(
        baseline,
        detectionCandidates(combination),
        combination.some((id) => MOVEMENTS[id].kind === 'punch'),
      ),
    [baseline, combination],
  );
  const session = useMemo(() => new TrainingSession(combination), [combination]);
  const [attempts, setAttempts] = useState<AttemptRecord[]>([]);
  const [feedback, setFeedback] = useState<AttemptRecord | null>(null);
  const [feetLost, setFeetLost] = useState(false);
  // Early advance: the next cue appears as soon as a movement is clearly underway;
  // the ✓/✗ for it lands a moment later when the feet settle.
  const [inFlight, setInFlight] = useState(false);
  const inFlightRef = useRef(false);
  const timeRef = useRef<HTMLSpanElement>(null);
  const startedRef = useRef(false);
  const lostSinceRef = useRef<number | null>(null);
  const feetLostRef = useRef(false);
  const finishingRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const debug = useMemo(isDebugMode, []);

  usePoseFrames((frame) => {
    const now = frame?.timestamp ?? performance.now();
    if (!startedRef.current) {
      session.start(now);
      startedRef.current = true;
    }
    const u = analyzer.push(frame);
    const visible = u.state !== 'LOW_CONFIDENCE';

    if (!visible) lostSinceRef.current ??= now;
    else lostSinceRef.current = null;
    const lost = lostSinceRef.current !== null && now - lostSinceRef.current > LOST_WARNING_MS;
    if (lost !== feetLostRef.current) {
      feetLostRef.current = lost;
      setFeetLost(lost);
    }

    if (session.done) return;
    const flying = u.underway || (inFlightRef.current && u.movements.length === 0 && u.state === 'MOVEMENT_IN_PROGRESS');
    if (flying !== inFlightRef.current) {
      inFlightRef.current = flying;
      setInFlight(flying);
    }
    let rec: AttemptRecord | null = null;
    for (const m of u.movements) rec = session.onMovement(m) ?? rec;
    rec ??= session.tick(now, visible);
    if (rec) {
      setAttempts([...session.attempts]);
      setFeedback(rec);
      if (session.done && !finishingRef.current) {
        finishingRef.current = true;
        setTimeout(() => onCompleteRef.current(session.result()), TRAINING_CONFIG.finishDelayMs);
      }
    }
    if (timeRef.current) timeRef.current.textContent = fmtTime(now - session.result().startTime);
    if (debug) {
      armDebug(u.arms);
      debugInfo.state = u.state;
      debugInfo.expect = session.expected ?? '-';
      debugInfo.disp = u.displacement.toFixed(3);
      debugInfo.rot = `${u.rotation.toFixed(1)}°`;
    }
  });

  // Feedback is a brief toast; then back to "Listening".
  useEffect(() => {
    if (!feedback) return;
    const id = setTimeout(() => setFeedback(null), TRAINING_CONFIG.feedbackMs);
    return () => clearTimeout(id);
  }, [feedback]);

  const index = attempts.length;
  const cue = index + (inFlight ? 1 : 0);
  const status: SequenceStatus[] = combination.map((_, i) =>
    i < index ? (attempts[i].correct ? 'correct' : 'wrong') : i < cue ? 'done' : i === cue ? 'current' : 'upcoming',
  );
  const current = cue < combination.length ? MOVEMENTS[combination[cue]] : null;

  return (
    <>
      <div className="training-top">
        <MovementSequence items={combination} status={status} />
      </div>

      <div className="training-feedback">
        {feetLost ? (
          <div className="training-toast reveal" key="lost">
            <span className="label">Paused</span>
            <strong className="h2">Feet not clearly visible</strong>
          </div>
        ) : feedback ? (
          <FeedbackToast key={feedback.index} rec={feedback} />
        ) : (
          <span className="label practice-listening" key="listen">
            <i /> Listening for movement
          </span>
        )}
      </div>

      <footer className="training-hud">
        <div className="hud-current">
          <span className="label">{current ? 'Current move' : 'Round complete'}</span>
          {current && (
            <strong className="display hud-move" key={cue}>
              <Icon name={current.icon} className="hud-move-icon" />
              {current.label}
            </strong>
          )}
        </div>
        <div className="hud-stat">
          <span className="label">Move</span>
          <strong className="display">
            {Math.min(cue + 1, combination.length)}
            <span className="muted">/{combination.length}</span>
          </strong>
        </div>
        <div className="hud-stat">
          <span className="label">Time</span>
          <strong className="display">
            <span ref={timeRef}>00:00.0</span>
          </strong>
        </div>
      </footer>
    </>
  );
}

function FeedbackToast({ rec }: { rec: AttemptRecord }) {
  const expected = MOVEMENTS[rec.expected];
  if (rec.correct) {
    return (
      <div className="training-toast is-correct">
        <Icon name="check" className="toast-icon" />
        <strong className="h2">{expected.short} detected</strong>
      </div>
    );
  }
  const detected = rec.detected && !rec.detected.unclear ? MOVEMENTS[rec.detected.type].short : null;
  return (
    <div className="training-toast is-wrong">
      <span className="label">{rec.missed ? 'No movement detected' : detected ? `Detected ${detected}` : 'Movement unclear'}</span>
      <strong className="h2">Expected {expected.short}</strong>
    </div>
  );
}
