import { describe, expect, it } from 'vitest';
import { pivotFrames, stepFrames, stillFrames } from '../test/fixtures';
import type { PoseFrame } from '../pose/types';
import { BaselineCollector } from './baseline';
import { FootworkDetector, type DetectedMovement } from './FootworkDetector';
import { angleDelta, bodyYaw, classifyPivot } from './PivotDetector';
import { makeFrame, seededNoise } from '../test/fixtures';

function detect(frames: PoseFrame[]) {
  const c = new BaselineCollector();
  let baseline = null;
  for (const f of stillFrames(1600, { yaw: 0 })) {
    const s = c.push(f);
    if (s.phase === 'done') baseline = s.baseline;
  }
  const d = new FootworkDetector(baseline!);
  const found: DetectedMovement[] = [];
  for (const f of frames) {
    const u = d.push(f);
    if (u.movement) found.push(u.movement);
  }
  return found;
}

describe('bodyYaw convention', () => {
  it("is positive when the user turns toward their left (left side moves away from the camera)", () => {
    const y = bodyYaw(makeFrame({ yaw: 30 }))!;
    expect(y.shoulder).toBeCloseTo(30, 5);
    expect(y.hip).toBeCloseTo(30, 5);
  });

  it('is null without world landmarks', () => {
    expect(bodyYaw(makeFrame())).toBeNull();
  });

  it('angleDelta wraps across ±180', () => {
    expect(angleDelta(-170, 170)).toBeCloseTo(20);
    expect(angleDelta(170, -170)).toBeCloseTo(-20);
  });
});

describe('heuristic pivot detection', () => {
  it('PIVOT_LEFT: counter-clockwise rotation, hips in place, rear foot swings', () => {
    const found = detect(pivotFrames({ toYaw: 45, swingLateral: 0.25, swingForward: -0.1 }));
    expect(found).toHaveLength(1);
    expect(found[0].type).toBe('PIVOT_LEFT');
    expect(found[0].rotation).toBeGreaterThan(35);
    expect(found[0].unclear).toBe(false);
  });

  it('PIVOT_RIGHT: clockwise rotation', () => {
    const [m] = detect(pivotFrames({ toYaw: -45, swingLateral: -0.25 }));
    expect(m.type).toBe('PIVOT_RIGHT');
    expect(m.rotation).toBeLessThan(-35);
  });

  it('works from a bladed stance (relative rotation, not absolute angle)', () => {
    const [m] = detect(pivotFrames({ fromYaw: -35, toYaw: 10 }));
    expect(m.type).toBe('PIVOT_LEFT');
  });

  it('ignores a small rotation below the pivot threshold', () => {
    expect(detect(pivotFrames({ toYaw: 12 }))).toHaveLength(0);
  });

  it('a smaller pivot scores lower magnitude than a full one', () => {
    const [small] = detect(pivotFrames({ toYaw: 34 }));
    const [full] = detect(pivotFrames({ toYaw: 50 }));
    expect(small.type).toBe('PIVOT_LEFT');
    expect(small.magnitudeScore).toBeLessThan(full.magnitudeScore);
  });

  it('rotation with large hip travel is a step, not a pivot', () => {
    expect(classifyPivot({ shoulder: 40, hip: 40 }, 0.6)).toBeNull();
  });

  it('shoulders and hips disagreeing lowers direction confidence', () => {
    const agree = classifyPivot({ shoulder: 40, hip: 40 }, 0)!;
    const disagree = classifyPivot({ shoulder: 70, hip: -10 }, 0)!;
    expect(disagree.directionConfidence).toBeLessThan(agree.directionConfidence);
  });

  it('plain steps are still classified as steps when yaw is available', () => {
    const frames = stepFrames({ lateral: 0.3, first: 'right' }).map((f) => ({ ...f, world: makeFrame({ yaw: 0 }).world }));
    const [m] = detect(frames);
    expect(m.type).toBe('RIGHT_STEP');
  });

  it('yaw jitter (±4° per frame) neither fakes a pivot nor blocks a step from settling', () => {
    const noise = seededNoise(4, 7);
    const jittery = (f: PoseFrame) => {
      const y = noise();
      return { ...f, world: makeFrame({ yaw: y, hipYaw: -y * 0.5 }).world };
    };
    expect(detect(stillFrames(3000).map(jittery))).toHaveLength(0);
    const [m, ...rest] = detect(stepFrames({ forward: 0.15, scaleTo: 1.08 }).map(jittery));
    expect(m.type).toBe('FORWARD_STEP');
    expect(m.duration).toBeLessThan(900);
    expect(rest).toHaveLength(0);
  });
});
