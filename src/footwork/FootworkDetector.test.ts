import { describe, expect, it } from 'vitest';
import { makeFrame, seededNoise, stepFrames, stillFrames } from '../test/fixtures';
import type { PoseFrame } from '../pose/types';
import { BaselineCollector } from './baseline';
import { CORE_MOVEMENTS } from '../movements';
import { classifyDisplacement } from './classifier';
import { FootworkDetector, type DetectedMovement } from './FootworkDetector';

function baseline() {
  const c = new BaselineCollector();
  for (const f of stillFrames(1600)) {
    const s = c.push(f);
    if (s.phase === 'done') return s.baseline;
  }
  throw new Error('no baseline');
}

function detect(frames: PoseFrame[]) {
  const d = new FootworkDetector(baseline());
  const found: DetectedMovement[] = [];
  for (const f of frames) {
    const u = d.push(f);
    if (u.movement) found.push(u.movement);
  }
  return found;
}

describe('FORWARD_STEP', () => {
  it('detects a step toward the camera (feet move down in the image, body grows)', () => {
    const found = detect(stepFrames({ forward: 0.15, scaleTo: 1.08, first: 'left' }));
    expect(found).toHaveLength(1);
    const m = found[0];
    expect(m.type).toBe('FORWARD_STEP');
    expect(m.unclear).toBe(false);
    expect(m.directionConfidence).toBeGreaterThan(0.9);
    expect(m.vector.forward).toBeGreaterThan(0);
    expect(m.footOrder).toBe('left-first'); // orthodox lead foot first
    expect(m.duration).toBeGreaterThan(250);
    expect(m.duration).toBeLessThan(700);
  });

  it('reports the step only once, even while standing still afterwards', () => {
    const frames = [...stepFrames({ forward: 0.15, scaleTo: 1.08 }), ...stillFrames(2000, { feetY: 0.88 + 0.15 * 0.25, scale: 1.08 }, 1500)];
    expect(detect(frames)).toHaveLength(1);
  });

  it('a contradicting depth cue (body shrinks) lowers direction confidence', () => {
    const agree = classifyDisplacement({ lateral: 0, forward: 0.3 }, 0.07)!;
    const contra = classifyDisplacement({ lateral: 0, forward: 0.3 }, -0.07)!;
    expect(agree.type).toBe('FORWARD_STEP');
    expect(contra.directionConfidence).toBeLessThan(agree.directionConfidence);
  });
});

describe('BACKWARD / LEFT / RIGHT', () => {
  it('BACKWARD_STEP: feet move up in the image, rear foot first', () => {
    const [m] = detect(stepFrames({ forward: -0.15, scaleTo: 0.93, first: 'right' }));
    expect(m.type).toBe('BACKWARD_STEP');
    expect(m.footOrder).toBe('right-first');
  });

  it("LEFT_STEP: user's anatomical left = larger raw-image x", () => {
    const [m] = detect(stepFrames({ lateral: -0.3, first: 'left' }));
    expect(m.type).toBe('LEFT_STEP');
    expect(m.vector.lateral).toBeLessThan(0);
    expect(m.footOrder).toBe('left-first');
  });

  it('RIGHT_STEP', () => {
    const [m] = detect(stepFrames({ lateral: 0.3, first: 'right' }));
    expect(m.type).toBe('RIGHT_STEP');
    expect(m.footOrder).toBe('right-first');
  });

  it('detects a sequence of steps in order', () => {
    const seq = [
      ...stepFrames({ forward: 0.15, scaleTo: 1.08 }),
    ];
    // Second step continues from the new stance position.
    const second = stepFrames({ lateral: 0.3, start: 1400 }).map((f) => shift(f, 0, 0.15 * 0.25, 1.08));
    const found = detect([...seq, ...second]);
    expect(found.map((m) => m.type)).toEqual(['FORWARD_STEP', 'RIGHT_STEP']);
  });

  it('a 45° displacement is a diagonal; with only core moves it has low direction confidence', () => {
    const diag = classifyDisplacement({ lateral: 0.3, forward: 0.3 }, 0)!;
    expect(diag.type).toBe('FORWARD_RIGHT');
    expect(diag.directionConfidence).toBeGreaterThan(0.95);
    const core = classifyDisplacement({ lateral: 0.3, forward: 0.3 }, 0, CORE_MOVEMENTS.filter((m) => m.kind === 'step'))!;
    expect(core.directionConfidence).toBeLessThan(0.05);
  });

  it('tells a dash from a step by size', () => {
    expect(classifyDisplacement({ lateral: 0, forward: 0.45 }, 0.05)!.type).toBe('FORWARD_STEP');
    expect(classifyDisplacement({ lateral: 0, forward: 1.1 }, 0.1)!.type).toBe('DASH_FORWARD');
    expect(classifyDisplacement({ lateral: 0, forward: -1.0 }, -0.1)!.type).toBe('DASH_BACKWARD');
  });

  it('detects a diagonal step from synthetic frames', () => {
    const [m] = detect(stepFrames({ lateral: -0.2, forward: 0.1, scaleTo: 1.05 }));
    expect(m.type).toBe('FORWARD_LEFT');
  });
});

describe('noise rejection', () => {
  it('ignores pose jitter while standing still', () => {
    const noise = seededNoise(0.004);
    const frames = stepFrames({ restMs: 1500, moveMs: 400, noise: () => noise() });
    expect(detect(frames)).toHaveLength(0);
  });

  it('ignores a shuffle smaller than the minimum displacement', () => {
    expect(detect(stepFrames({ lateral: 0.1 }))).toHaveLength(0);
  });

  it('does not evaluate when ankles are not visible', () => {
    const d = new FootworkDetector(baseline());
    const u = d.push(makeFrame({ override: { leftAnkle: { x: 0.53, y: 0.88, visibility: 0.1 } } }));
    expect(u.state).toBe('LOW_CONFIDENCE');
    expect(u.movement).toBeUndefined();
  });
});

/** Translate every landmark of a frame (simulates continuing from a moved stance). */
function shift(f: PoseFrame, dx: number, dy: number, scale: number): PoseFrame {
  const out = { ...f } as PoseFrame;
  for (const [k, v] of Object.entries(f)) {
    if (k !== 'world' && typeof v === 'object') {
      (out as unknown as Record<string, unknown>)[k] = { ...v, x: v.x + dx, y: 0.88 + (v.y - 0.88) * scale + dy };
    }
  }
  return out;
}
