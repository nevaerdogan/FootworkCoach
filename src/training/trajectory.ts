import { FOOTWORK_CONFIG } from '../config';
import { MOVEMENTS, type MovementId } from '../movements';
import type { MovementScore } from './scoring';

/**
 * Top-down trajectory of a round, for the results screen.
 * Plot space: x + = user's right, y + = forward (toward the camera), in body-scale units.
 * The forward axis gets the detector's forward gain so steps keep roughly true proportions.
 */
export interface Pt {
  x: number;
  y: number;
}

export interface TrajectorySegment {
  index: number;
  expected: MovementId;
  status: MovementScore['status'];
  left: Pt[];
  right: Pt[];
  start: Pt;
  end: Pt;
  /** Where the expected movement would have gone (steps only). */
  expectedEnd: Pt | null;
  /** Measured rotation for pivots (deg). */
  rotation: number;
}

export function buildTrajectory(movements: MovementScore[], gain = FOOTWORK_CONFIG.forwardGain): TrajectorySegment[] {
  let origin: Pt = { x: 0, y: 0 };
  return movements.map((m) => {
    const def = MOVEMENTS[m.expected];
    const toPt = (v: { lateral: number; forward: number }): Pt => ({ x: origin.x + v.lateral, y: origin.y + v.forward * gain });
    const path = m.detected?.path ?? [];
    const left = path.map((s) => toPt(s.left));
    const right = path.map((s) => toPt(s.right));
    const start = origin;
    const end =
      left.length && right.length
        ? { x: (left[left.length - 1].x + right[right.length - 1].x) / 2, y: (left[left.length - 1].y + right[right.length - 1].y) / 2 }
        : start;
    const expectedEnd =
      def.kind === 'step' || (def.kind === 'switch' && def.travel > 0)
        ? {
            x: start.x + def.direction.lateral * def.detection.expectedDisplacement,
            y: start.y + def.direction.forward * def.detection.expectedDisplacement,
          }
        : null;
    origin = end;
    return { index: m.index, expected: m.expected, status: m.status, left, right, start, end, expectedEnd, rotation: m.detected?.rotation ?? 0 };
  });
}

/** Bounding box of everything drawn, with padding. */
export function trajectoryBounds(segments: TrajectorySegment[], pad = 0.25) {
  const pts = segments.flatMap((s) => [...s.left, ...s.right, s.start, s.end, ...(s.expectedEnd ? [s.expectedEnd] : [])]);
  if (!pts.length) pts.push({ x: 0, y: 0 });
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { x0: Math.min(...xs) - pad, x1: Math.max(...xs) + pad, y0: Math.min(...ys) - pad, y1: Math.max(...ys) + pad };
}
