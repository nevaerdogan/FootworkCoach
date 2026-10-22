import { describe, expect, it } from 'vitest';
import type { PoseFrame } from '../pose/types';
import { makeFrame, seededNoise } from '../test/fixtures';
import { bobFrames, jumpFrames, pushUpFrames } from '../test/repFixtures';
import { JumpCounter } from './JumpCounter';

const feed = (c: JumpCounter, frames: PoseFrame[]) => frames.map((f) => c.push(f));

describe('JumpCounter', () => {
  it('counts every jump at a skipping pace (2 per second)', () => {
    const updates = feed(new JumpCounter(), jumpFrames({ count: 10, height: 0.12 }));
    expect(updates[updates.length - 1].reps).toBe(10);
  });

  it('double-bounce style: the small rebound hop between jumps is not a jump', () => {
    const updates = feed(new JumpCounter(), jumpFrames({ count: 10, height: 0.2, rebound: 0.4 }));
    expect(updates[updates.length - 1].reps).toBe(10);
  });

  it('bending the knees without leaving the floor is not a jump', () => {
    const updates = feed(new JumpCounter(), bobFrames({ count: 10, depth: 0.12 }));
    expect(updates[updates.length - 1].reps).toBe(0);
  });

  it('tiny hops below the minimum height are ignored', () => {
    const updates = feed(new JumpCounter(), jumpFrames({ count: 10, height: 0.025 }));
    expect(updates[updates.length - 1].reps).toBe(0);
  });

  it('standing still with pose jitter never counts', () => {
    const noise = seededNoise(0.003, 5);
    const frames: PoseFrame[] = [];
    for (let t = 0; t <= 5000; t += 33) frames.push(makeFrame({ t, feetY: 0.88 + noise(), cx: 0.5 + noise() }));
    expect(feed(new JumpCounter(), frames).at(-1)!.reps).toBe(0);
  });

  it('a body on the floor is not standing: no jumps are counted', () => {
    const updates = feed(new JumpCounter(), pushUpFrames({ count: 3 }));
    expect(updates.every((u) => u.tracking !== 'ok')).toBe(true);
    expect(updates[updates.length - 1].reps).toBe(0);
  });

  it('is independent of camera distance', () => {
    const near = feed(new JumpCounter(), jumpFrames({ count: 6, height: 0.1 })).at(-1)!.reps;
    // Same jumps with the body half the size in the image (twice as far away).
    const far = feed(new JumpCounter(), jumpFrames({ count: 6, height: 0.1, scale: 0.5 })).at(-1)!.reps;
    expect(near).toBe(6);
    expect(far).toBe(6);
  });
});
