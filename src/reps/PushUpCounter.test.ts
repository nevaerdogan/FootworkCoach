import { describe, expect, it } from 'vitest';
import type { PoseFrame } from '../pose/types';
import { seededNoise } from '../test/fixtures';
import { pushUpFrame, pushUpFrames, standingFrames } from '../test/repFixtures';
import { PushUpCounter } from './PushUpCounter';
import type { RepUpdate } from './types';

function feed(counter: PushUpCounter, frames: (PoseFrame | null)[], tOf?: (i: number) => number): RepUpdate[] {
  return frames.map((f, i) => counter.push(f, f ? undefined : tOf?.(i)));
}

describe('PushUpCounter', () => {
  it('counts full push-ups once each (side view, left side to the camera)', () => {
    const c = new PushUpCounter();
    const updates = feed(c, pushUpFrames({ count: 5 }));
    const last = updates[updates.length - 1];
    expect(last.reps).toBe(5);
    expect(last.partials).toBe(0);
    expect(updates.filter((u) => u.event?.kind === 'rep')).toHaveLength(5);
  });

  it('works when the right side faces the camera', () => {
    const c = new PushUpCounter();
    const updates = feed(c, pushUpFrames({ count: 4, near: 'right' }));
    expect(updates[updates.length - 1].reps).toBe(4);
  });

  it('shallow push-ups are partial reps with a "Go lower" hint, not reps', () => {
    const c = new PushUpCounter();
    const updates = feed(c, pushUpFrames({ count: 4, bottom: 125 }));
    const last = updates[updates.length - 1];
    expect(last.reps).toBe(0);
    expect(last.partials).toBe(4);
    expect(updates.some((u) => u.hint === 'Go lower')).toBe(true);
  });

  it('a straight body gives no form hint; sagging hips do', () => {
    const clean = feed(new PushUpCounter(), pushUpFrames({ count: 2 }));
    expect(clean.some((u) => u.hint)).toBe(false);
    const sag = feed(new PushUpCounter(), pushUpFrames({ count: 2, sag: 0.08 }));
    expect(sag[sag.length - 1].reps).toBe(2);
    expect(sag.some((u) => u.hint === 'Keep your body straight')).toBe(true);
  });

  it('flexing the arms while standing is not a push-up', () => {
    const c = new PushUpCounter();
    const updates = feed(c, standingFrames(2000));
    expect(updates.every((u) => u.tracking === 'posture')).toBe(true);
    expect(updates[updates.length - 1].reps).toBe(0);
  });

  it('elbow jitter at the top never counts', () => {
    const c = new PushUpCounter();
    const noise = seededNoise(15, 7);
    const frames: PoseFrame[] = [];
    for (let t = 0; t <= 4000; t += 33) frames.push(pushUpFrame(t, 150 + noise()));
    const last = feed(c, frames).at(-1)!;
    expect(last.reps + last.partials).toBe(0);
  });

  it('a rep interrupted by lost tracking is dropped; later reps still count', () => {
    const c = new PushUpCounter();
    const frames: (PoseFrame | null)[] = pushUpFrames({ count: 2, repMs: 1000, restMs: 400 }).map((f) =>
      f.timestamp >= 700 && f.timestamp <= 1300 ? null : f,
    );
    const updates = feed(c, frames, (i) => i * 33);
    expect(updates.some((u) => u.tracking === 'lost')).toBe(true);
    expect(updates[updates.length - 1].reps).toBe(1);
  });

  it('reports the live depth for the gauge', () => {
    const c = new PushUpCounter();
    const updates = feed(c, pushUpFrames({ count: 1 }));
    const max = Math.max(...updates.map((u) => u.progress));
    expect(max).toBeGreaterThan(0.9);
    expect(updates[0].progress).toBeLessThan(0.1);
  });
});
