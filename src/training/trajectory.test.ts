import { describe, expect, it } from 'vitest';
import type { DetectedMovement, FootSample } from '../footwork/FootworkDetector';
import type { MovementScore } from './scoring';
import { buildTrajectory, trajectoryBounds } from './trajectory';

const path = (dl: number, df: number): FootSample[] =>
  [0, 0.5, 1].map((k, i) => ({
    t: i * 100,
    left: { lateral: -0.2 + dl * k, forward: 0.1 + df * k },
    right: { lateral: 0.2 + dl * k, forward: -0.1 + df * k },
  }));

const ms = (expected: MovementScore['expected'], p: FootSample[] | null): MovementScore =>
  ({
    index: 0,
    expected,
    detected: p ? ({ path: p, rotation: 0 } as unknown as DetectedMovement) : null,
    status: p ? 'correct' : 'missed',
  }) as MovementScore;

describe('buildTrajectory', () => {
  it('chains movements: each starts where the previous ended', () => {
    const segs = buildTrajectory([ms('RIGHT_STEP', path(0.5, 0)), ms('FORWARD_STEP', path(0, 0.2))], 2);
    expect(segs[0].start).toEqual({ x: 0, y: 0 });
    expect(segs[0].end.x).toBeCloseTo(0.5);
    expect(segs[1].start).toEqual(segs[0].end);
    // Forward axis uses the gain (0.2 image units × 2).
    expect(segs[1].end.y - segs[1].start.y).toBeCloseTo(0.4);
  });

  it('expected end follows the movement definition direction', () => {
    const [s] = buildTrajectory([ms('LEFT_STEP', path(-0.5, 0))]);
    expect(s.expectedEnd!.x).toBeLessThan(0);
    expect(s.expectedEnd!.y).toBeCloseTo(0);
  });

  it('a missed move has no path and does not move the origin', () => {
    const segs = buildTrajectory([ms('LEFT_STEP', null), ms('RIGHT_STEP', path(0.5, 0))]);
    expect(segs[0].left).toHaveLength(0);
    expect(segs[1].start).toEqual({ x: 0, y: 0 });
  });

  it('bounds include all points with padding', () => {
    const b = trajectoryBounds(buildTrajectory([ms('RIGHT_STEP', path(0.5, 0))]), 0.1);
    expect(b.x1).toBeGreaterThan(0.6);
    expect(b.x0).toBeLessThan(-0.2);
  });
});
