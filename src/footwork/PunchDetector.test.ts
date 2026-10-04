import { describe, expect, it } from 'vitest';
import { makeFrame, punchFrames, seededNoise, stepFrames, worldTorso } from '../test/fixtures';
import type { PoseFrame } from '../pose/types';
import { armExtension, PunchDetector, punchAsMovement, type DetectedPunch } from './PunchDetector';

function run(frames: PoseFrame[]) {
  const d = new PunchDetector('orthodox');
  const found: DetectedPunch[] = [];
  for (const f of frames) {
    const u = d.push(f);
    if (u.punch) found.push(u.punch);
  }
  return found;
}

describe('arm extension', () => {
  it('guard is bent (~0.5), full extension is ~1 and reaches toward the camera', () => {
    const g = worldTorso(0, 0);
    const e = worldTorso(0, 0, { left: 1 });
    const guard = armExtension(g.leftShoulder, g.leftElbow, g.leftWrist);
    const out = armExtension(e.leftShoulder, e.leftElbow, e.leftWrist);
    expect(guard.extension).toBeLessThan(0.6);
    expect(out.extension).toBeGreaterThan(0.95);
    expect(out.forward).toBeGreaterThan(0.4);
  });
});

describe('PunchDetector', () => {
  it('lead (left) arm out and back = JAB for an orthodox fighter', () => {
    const [p, ...rest] = run(punchFrames({ arm: 'left' }));
    expect(p.type).toBe('JAB');
    expect(p.arm).toBe('left');
    expect(p.confidence).toBeGreaterThan(0.8);
    expect(p.duration).toBeLessThan(700);
    expect(rest).toHaveLength(0);
  });

  it('rear (right) arm = CROSS', () => {
    expect(run(punchFrames({ arm: 'right' }))[0].type).toBe('CROSS');
  });

  it('a small guard adjustment is not a punch', () => {
    expect(run(punchFrames({ arm: 'left', peak: 0.2 }))).toHaveLength(0);
  });

  it('a punch whose depth MediaPipe compresses (looks ~half extended) is still detected', () => {
    const [p] = run(punchFrames({ arm: 'left', peak: 0.45 }));
    expect(p?.type).toBe('JAB');
    expect(p.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('guard jitter (both arms twitching) for several seconds produces no punches', () => {
    const noise = seededNoise(0.12, 3);
    const frames: PoseFrame[] = [];
    for (let t = 0; t <= 4000; t += 33) {
      frames.push(makeFrame({ t, yaw: 0, armExt: { left: Math.abs(noise()), right: Math.abs(noise()) } }));
    }
    expect(run(frames)).toHaveLength(0);
  });

  it('punches thrown from a different guard after a while are still detected (guard is learned)', () => {
    // Guard drifts higher (more extended) for 2 s, then a jab.
    const frames: PoseFrame[] = [];
    for (let t = 0; t <= 2000; t += 33) frames.push(makeFrame({ t, yaw: 0, armExt: { left: 0.2, right: 0.2 } }));
    const jab = punchFrames({ arm: 'left', start: 2033 });
    expect(run([...frames, ...jab]).map((p) => p.type)).toEqual(['JAB']);
  });

  it('an arm held out for a long time is not a punch', () => {
    expect(run(punchFrames({ arm: 'left', outMs: 2600 }))).toHaveLength(0);
  });

  it('footwork alone produces no punches', () => {
    const frames = stepFrames({ forward: 0.15 }).map((f) => ({ ...f, world: makeFrame({ armExt: {} }).world }));
    expect(run(frames)).toHaveLength(0);
  });

  it('ignores arms whose wrist is not visible', () => {
    const frames = punchFrames({ arm: 'left' }).map((f) => ({ ...f, leftWrist: { ...f.leftWrist, visibility: 0.1 } }));
    expect(run(frames)).toHaveLength(0);
  });

  it('never throws on frames whose world data has no arm points (stale producer)', () => {
    const d = new PunchDetector('orthodox');
    const f = makeFrame({ yaw: 0 });
    const { leftShoulder, rightShoulder, leftHip, rightHip } = f.world!;
    const legacy = { ...f, world: { leftShoulder, rightShoulder, leftHip, rightHip } } as unknown as PoseFrame;
    expect(() => d.push(legacy)).not.toThrow();
    expect(d.push(legacy).armActive).toBe(false);
  });

  it('converts to the shared movement shape', () => {
    const [p] = run(punchFrames({ arm: 'left' }));
    const m = punchAsMovement(p);
    expect(m).toMatchObject({ type: 'JAB', unclear: false, rotation: 0 });
    expect(m.displacement).toBeCloseTo(p.extension);
  });
});
