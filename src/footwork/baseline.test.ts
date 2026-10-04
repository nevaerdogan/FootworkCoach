import { describe, expect, it } from 'vitest';
import { makeFrame, stillFrames } from '../test/fixtures';
import { BaselineCollector, type CalibrationStatus } from './baseline';
import { normalizeFrame, toBodySpace } from './normalization';

const run = (c: BaselineCollector, frames: ReturnType<typeof stillFrames>) => {
  let s: CalibrationStatus = { phase: 'waiting', reason: 'NOT_VISIBLE', progress: 0 };
  for (const f of frames) s = c.push(f);
  return s;
};

describe('BaselineCollector', () => {
  it('captures a baseline after holding a still stance', () => {
    const s = run(new BaselineCollector(), stillFrames(1600));
    expect(s.phase).toBe('done');
    if (s.phase !== 'done') return;
    expect(s.baseline.bodyScale).toBeCloseTo(0.25, 3);
    expect(s.baseline.stanceWidth).toBeCloseTo(0.1 / 0.25, 3);
    expect(s.baseline.leadFoot).toBe('left');
  });

  it('does not finish before the hold duration', () => {
    const s = run(new BaselineCollector(), stillFrames(800));
    expect(s.phase).toBe('collecting');
    expect(s.progress).toBeGreaterThan(0.4);
    expect(s.progress).toBeLessThan(1);
  });

  it('restarts when the feet move during calibration', () => {
    const c = new BaselineCollector();
    run(c, stillFrames(1000));
    const moved = c.push(makeFrame({ t: 1033, cx: 0.56 }));
    expect(moved).toMatchObject({ phase: 'collecting', reason: 'MOVED', progress: 0 });
  });

  it('waits while ankles are not clearly visible', () => {
    const c = new BaselineCollector();
    const s = c.push(makeFrame({ override: { leftAnkle: { x: 0.53, y: 0.88, visibility: 0.1 } } }));
    expect(s.phase).toBe('waiting');
  });
});

describe('normalization', () => {
  const baselineAt = (scale: number) => {
    const s = run(new BaselineCollector(), stillFrames(1600, { scale }));
    if (s.phase !== 'done') throw new Error('no baseline');
    return s.baseline;
  };

  it('is invariant to camera distance', () => {
    // Same physical step (0.1 torso-units to the side) seen near and far.
    for (const scale of [1, 0.5]) {
      const b = baselineAt(scale);
      const stepped = makeFrame({ scale, cx: 0.5 - (0.1 * 0.25 * scale) / (16 / 9) });
      const n = normalizeFrame(stepped, b);
      expect(n.stanceCenter.lateral).toBeCloseTo(0.1, 3);
      expect(n.stanceCenter.forward).toBeCloseTo(0, 3);
    }
  });

  it('maps raw-image x decrease to the user\'s RIGHT (anatomical, not mirrored)', () => {
    const b = baselineAt(1);
    const v = toBodySpace({ x: b.stanceCenter.x - 0.05, y: b.stanceCenter.y }, b);
    expect(v.lateral).toBeGreaterThan(0);
  });

  it('maps ankle y 0.70 → 0.50 to BACKWARD (away from camera)', () => {
    const b = baselineAt(1);
    const from = toBodySpace({ x: b.stanceCenter.x, y: 0.7 }, b);
    const to = toBodySpace({ x: b.stanceCenter.x, y: 0.5 }, b);
    expect(to.forward - from.forward).toBeLessThan(0);
  });

  it('reports scaleRatio > 1 when the user comes closer', () => {
    const b = baselineAt(0.8);
    expect(normalizeFrame(makeFrame({ scale: 0.9 }), b).scaleRatio).toBeGreaterThan(1);
  });
});
