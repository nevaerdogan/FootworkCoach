import { describe, expect, it } from 'vitest';
import type { PoseFrame } from '../pose/types';
import { seededNoise } from '../test/fixtures';
import { sitUpFrame, sitUpFrames, standingFrames } from '../test/repFixtures';
import { SitUpCounter } from './SitUpCounter';

const feed = (c: SitUpCounter, frames: PoseFrame[]) => frames.map((f) => c.push(f));

describe('SitUpCounter', () => {
  it('counts full sit-ups once each', () => {
    const updates = feed(new SitUpCounter(), sitUpFrames({ count: 5 }));
    const last = updates[updates.length - 1];
    expect(last.reps).toBe(5);
    expect(last.partials).toBe(0);
  });

  it('works with the right side to the camera', () => {
    const updates = feed(new SitUpCounter(), sitUpFrames({ count: 3, near: 'right' }));
    expect(updates[updates.length - 1].reps).toBe(3);
  });

  it('crunches are partial reps with a hint', () => {
    const updates = feed(new SitUpCounter(), sitUpFrames({ count: 4, up: 35 }));
    const last = updates[updates.length - 1];
    expect(last.reps).toBe(0);
    expect(last.partials).toBe(4);
    expect(updates.some((u) => u.hint === 'Come all the way up')).toBe(true);
  });

  it('bending forward while standing is not a sit-up', () => {
    const updates = feed(new SitUpCounter(), standingFrames(2000));
    expect(updates.every((u) => u.tracking === 'posture')).toBe(true);
  });

  it('torso jitter while lying never counts', () => {
    const noise = seededNoise(8, 3);
    const frames: PoseFrame[] = [];
    for (let t = 0; t <= 4000; t += 33) frames.push(sitUpFrame(t, 10 + Math.abs(noise())));
    const last = feed(new SitUpCounter(), frames).at(-1)!;
    expect(last.reps + last.partials).toBe(0);
  });
});
