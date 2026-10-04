import { describe, expect, it } from 'vitest';
import { makeFrame, seededNoise, stepFrames } from '../test/fixtures';
import type { PoseFrame } from '../pose/types';
import { BounceDetector, liveTempo, type Bounce } from './BounceDetector';

/** Whole body bouncing: feetY rises by `amp` (image units) at `hz`, for `ms`. */
function bounceFrames(opts: { hz: number; amp: number; ms: number; scale?: number }): PoseFrame[] {
  const { hz, amp, ms, scale = 1 } = opts;
  const out: PoseFrame[] = [];
  for (let t = 0; t <= ms; t += 33) {
    const up = t < 600 ? 0 : Math.max(0, Math.sin(2 * Math.PI * hz * (t - 600) / 1000)) * amp;
    out.push(makeFrame({ t, feetY: 0.88 - up, scale }));
  }
  return out;
}

const run = (frames: PoseFrame[]) => {
  const d = new BounceDetector();
  return frames.map((f) => d.push(f)).filter((b): b is Bounce => !!b);
};

describe('BounceDetector', () => {
  it('counts a steady 2 Hz bounce', () => {
    const b = run(bounceFrames({ hz: 2, amp: 0.012, ms: 5600 }));
    // 5 s of bouncing at 2 Hz ≈ 10 bounces.
    expect(b.length).toBeGreaterThanOrEqual(9);
    expect(b.length).toBeLessThanOrEqual(11);
    expect(b.every((x) => x.clear)).toBe(true);
    expect(liveTempo(b.map((x) => x.t))).toBeGreaterThan(105);
    expect(liveTempo(b.map((x) => x.t))).toBeLessThan(135);
  });

  it('is independent of camera distance (same bounce, smaller body)', () => {
    const near = run(bounceFrames({ hz: 2, amp: 0.012, ms: 5600 })).length;
    const far = run(bounceFrames({ hz: 2, amp: 0.006, ms: 5600, scale: 0.5 })).length;
    expect(Math.abs(near - far)).toBeLessThanOrEqual(1);
  });

  it('marks tiny bounces as weak', () => {
    const b = run(bounceFrames({ hz: 2, amp: 0.0078, ms: 5600 }));
    expect(b.length).toBeGreaterThan(5);
    expect(b.some((x) => !x.clear)).toBe(true);
  });

  it('ignores pose jitter while standing still', () => {
    const noise = seededNoise(0.0025, 5);
    const frames = Array.from({ length: 150 }, (_, i) => makeFrame({ t: i * 33, feetY: 0.88 + noise() }));
    expect(run(frames)).toHaveLength(0);
  });

  it('a normal step is not a stream of bounces', () => {
    expect(run(stepFrames({ forward: 0.15, scaleTo: 1.08 })).length).toBeLessThanOrEqual(1);
  });
});
