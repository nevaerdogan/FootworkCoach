// Development only: a realistic round (one small pivot, one wrong move) for previewing the results screen.
import type { DetectedMovement, FootSample } from '../footwork/FootworkDetector';
import { MOVEMENTS, type MovementId } from '../movements';
import { TrainingSession, type SessionResult } from '../training/TrainingSession';

/** Foot path for a step in the movement's direction (lead foot first), in body-space units. */
function pathFor(type: MovementId, start: number): FootSample[] {
  const d = MOVEMENTS[type];
  const dl = d.direction.lateral * 0.5 * d.travel;
  const df = (d.direction.forward * 0.5 * d.travel) / 2; // image units (before forward gain)
  const ease = (x: number) => Math.max(0, Math.min(1, x)) ** 2 * (3 - 2 * Math.max(0, Math.min(1, x)));
  return Array.from({ length: 12 }, (_, i) => {
    const k = i / 11;
    const a = ease(k * 1.4);
    const b = ease(k * 1.4 - 0.4);
    return {
      t: start + i * 40,
      left: { lateral: -0.25 + dl * a, forward: 0.12 + df * a },
      right: { lateral: 0.25 + dl * b, forward: -0.12 + df * b },
    };
  });
}

const mv = (type: MovementId, start: number, o: Partial<DetectedMovement> = {}): DetectedMovement => ({
  path: MOVEMENTS[type].kind === 'step' ? pathFor(type, start) : [],
  type,
  directionConfidence: 0.93,
  magnitudeScore: 1,
  confidence: 0.92,
  displacement: 0.48,
  vector: { lateral: 0, forward: 0.48 },
  startTime: start,
  endTime: start + 480,
  duration: 480,
  firstFoot: null,
  footOrder: 'unknown',
  rotation: 0,
  unclear: false,
  ...o,
});

export function sampleResult(): SessionResult {
  const s = new TrainingSession(['FORWARD_STEP', 'LEFT_STEP', 'PIVOT_RIGHT', 'BACKWARD_STEP', 'RIGHT_STEP', 'PIVOT_LEFT']);
  s.start(0);
  s.onMovement(mv('FORWARD_STEP', 420, { firstFoot: 'left', footOrder: 'left-first' }));
  s.onMovement(mv('LEFT_STEP', 1300, { directionConfidence: 0.81, displacement: 0.42 }));
  s.onMovement(mv('PIVOT_RIGHT', 2250, { rotation: -29, directionConfidence: 0.74 }));
  s.onMovement(mv('BACKWARD_STEP', 3100, { displacement: 0.55 }));
  s.onMovement(mv('LEFT_STEP', 4000));
  s.onMovement(mv('PIVOT_LEFT', 4900, { rotation: 47 }));
  return s.result();
}
