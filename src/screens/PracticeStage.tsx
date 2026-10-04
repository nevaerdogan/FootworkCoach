import { useMemo, useRef, useState } from 'react';
import { usePoseFrames } from '../components/CameraView';
import { armDebug, debugInfo, isDebugMode } from '../components/DebugPanel';
import { Icon } from '../components/Icon';
import type { BaselineState } from '../footwork/baseline';
import type { DetectedMovement } from '../footwork/FootworkDetector';
import { liveTempo } from '../footwork/BounceDetector';
import { MotionAnalyzer } from '../footwork/MotionAnalyzer';
import { FOOTWORK_CONFIG } from '../config';
import { MOVEMENTS } from '../movements';

/** Hide brief tracking dropouts; only warn when the feet are lost for this long. */
const LOST_WARNING_MS = 300;
/** Show the live rotation gauge from this many degrees of body turn. */
const ROTATION_GAUGE_MIN_DEG = 6;
/** The bounce counter resets after this long without a bounce. */
const BOUNCE_IDLE_MS = 1500;

interface Props {
  baseline: BaselineState;
  onRecalibrate: () => void;
  onDone: () => void;
}

/** Free practice: every detected step is shown as it happens. */
export function PracticeStage({ baseline, onRecalibrate, onDone }: Props) {
  const analyzer = useMemo(() => new MotionAnalyzer(baseline), [baseline]);
  const [recent, setRecent] = useState<DetectedMovement[]>([]);
  const [feetLost, setFeetLost] = useState(false);
  const lostSinceRef = useRef<number | null>(null);
  const feetLostRef = useRef(false);
  const debug = useMemo(isDebugMode, []);
  const gaugeRef = useRef<HTMLDivElement>(null);
  // Shuffle: bounces get their own live counter instead of flooding the move list.
  const bounceRef = useRef<HTMLDivElement>(null);
  const bounceTimes = useRef<number[]>([]);

  usePoseFrames((frame) => {
    const u = analyzer.push(frame);
    const now = performance.now();

    if (u.state === 'LOW_CONFIDENCE') lostSinceRef.current ??= now;
    else lostSinceRef.current = null;
    const lost = lostSinceRef.current !== null && now - lostSinceRef.current > LOST_WARNING_MS;
    if (lost !== feetLostRef.current) {
      feetLostRef.current = lost;
      setFeetLost(lost);
    }

    const moves = u.movements.filter((m) => m.type !== 'BOUNCE');
    if (moves.length) setRecent((prev) => [...[...moves].reverse(), ...prev].slice(0, 5));
    for (const m of u.movements) if (m.type === 'BOUNCE') bounceTimes.current.push(m.startTime);
    const bt = bounceTimes.current;
    const lastBounce = bt[bt.length - 1] ?? -Infinity;
    if (frame && frame.timestamp - lastBounce > BOUNCE_IDLE_MS) bounceTimes.current = [];
    const bc = bounceRef.current;
    if (bc) {
      const n = bounceTimes.current.length;
      bc.classList.toggle('is-on', n >= 2);
      if (n >= 2) {
        bc.querySelector('.practice-gauge-value')!.textContent = String(n);
        bc.querySelector('.practice-gauge-dir')!.textContent = `Bounces · ${Math.round(liveTempo(bounceTimes.current))}/min`;
      }
    }

    // Live rotation gauge: written straight to the DOM (no React render per frame).
    const g = gaugeRef.current;
    if (g) {
      const deg = Math.round(Math.abs(u.rotation));
      const on = deg >= ROTATION_GAUGE_MIN_DEG;
      g.classList.toggle('is-on', on);
      g.classList.toggle('is-over', deg >= FOOTWORK_CONFIG.pivotAngleThreshold);
      if (on) {
        g.querySelector('.practice-gauge-value')!.textContent = `${deg}°`;
        g.querySelector('.practice-gauge-dir')!.textContent = u.rotation > 0 ? 'Turning left' : 'Turning right';
        (g.querySelector('.practice-gauge-fill') as HTMLElement).style.transform = `scaleX(${Math.min(1, deg / 45)})`;
      }
    }
    if (debug) {
      armDebug(u.arms);
      debugInfo.state = u.state;
      debugInfo.disp = u.displacement.toFixed(3);
      debugInfo.rot = `${u.rotation.toFixed(1)}°`;
      const m = u.movements[u.movements.length - 1];
      if (m) debugInfo.last = `${m.type} c${m.confidence.toFixed(2)} d${m.directionConfidence.toFixed(2)} r${m.rotation.toFixed(0)} ${m.footOrder}`;
      if (u.punch) debugInfo.punch = `${u.punch.type} ext${u.punch.extension.toFixed(2)} reach${u.punch.reach.toFixed(2)}`;
    }
  });

  const last = recent[0];

  return (
    <footer className="session-bottom practice">
      {/* Shown only while the body is turning: current angle vs the 45° pivot target. */}
      <div ref={bounceRef} className="practice-gauge practice-bounce" aria-hidden="true">
        <span className="label practice-gauge-dir" />
        <strong className="display practice-gauge-value" />
      </div>
      <div ref={gaugeRef} className="practice-gauge" aria-hidden="true">
        <span className="label practice-gauge-dir" />
        <strong className="display practice-gauge-value" />
        <span className="practice-gauge-track">
          <i className="practice-gauge-fill" />
          <i className="practice-gauge-mark" style={{ left: `${(FOOTWORK_CONFIG.pivotAngleThreshold / 45) * 100}%` }} />
        </span>
      </div>
      <div className="practice-callout">
        {feetLost ? (
          <div className="reveal" key="lost">
            <h2 className="h2">Feet not clearly visible</h2>
            <p className="muted">Step back so both feet stay inside the frame.</p>
          </div>
        ) : last ? (
          <div className="practice-hit" key={last.endTime}>
            {last.unclear ? (
              <>
                <span className="label">Movement unclear</span>
                <h2 className="display practice-move muted">Try again</h2>
                <p className="muted">Make the step a little bigger and more direct.</p>
              </>
            ) : (
              <>
                <span className="label practice-detected">Detected</span>
                <h2 className="display practice-move">
                  <Icon name={MOVEMENTS[last.type].icon} className="practice-icon" />
                  {MOVEMENTS[last.type].short}
                </h2>
                <p className="muted">
                  {MOVEMENTS[last.type].kind === 'pivot' && `${Math.round(Math.abs(last.rotation))}° · `}
                  {Math.round(last.confidence * 100)}% confidence · {(last.duration / 1000).toFixed(2)} s
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="reveal" key="idle">
            <span className="label practice-listening">
              <i /> Listening for movement
            </span>
            <h2 className="h2">Take a step</h2>
            <p className="muted">Step, pivot, switch, shuffle, jab or cross.</p>
          </div>
        )}
      </div>

      {recent.length > 1 && (
        <ol className="practice-recent" aria-label="Recent movements">
          {recent.slice(1).map((m) => (
            <li key={m.endTime}>
              <Icon name={MOVEMENTS[m.type].icon} />
              <span>{m.unclear ? 'Unclear' : MOVEMENTS[m.type].short}</span>
              <span className="muted">{Math.round(m.confidence * 100)}%</span>
            </li>
          ))}
        </ol>
      )}

      <div className="session-actions">
        <button className="btn btn-ghost" onClick={onRecalibrate}>
          <Icon name="refresh" /> Recalibrate
        </button>
        <button className="btn btn-ghost" onClick={onDone}>
          Finish
        </button>
      </div>
    </footer>
  );
}
