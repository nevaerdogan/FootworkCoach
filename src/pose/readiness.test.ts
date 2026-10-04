import { describe, expect, it } from 'vitest';
import { toPoseFrame, LANDMARK_INDEX } from './landmarks';
import { assessReadiness } from './readiness';

/** Synthetic standing pose: nose 0.15, shoulders 0.3, hips 0.55, knees 0.72, ankles 0.88. */
function standingRaw(overrides: Record<number, { y?: number; visibility?: number }> = {}) {
  const raw = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.95 }));
  const set = (i: number, x: number, y: number) => (raw[i] = { ...raw[i], x, y });
  set(LANDMARK_INDEX.nose, 0.5, 0.15);
  set(LANDMARK_INDEX.leftShoulder, 0.56, 0.3);
  set(LANDMARK_INDEX.rightShoulder, 0.44, 0.3);
  set(LANDMARK_INDEX.leftHip, 0.54, 0.55);
  set(LANDMARK_INDEX.rightHip, 0.46, 0.55);
  set(LANDMARK_INDEX.leftKnee, 0.55, 0.72);
  set(LANDMARK_INDEX.rightKnee, 0.45, 0.72);
  set(LANDMARK_INDEX.leftAnkle, 0.56, 0.88);
  set(LANDMARK_INDEX.rightAnkle, 0.44, 0.88);
  for (const [i, o] of Object.entries(overrides)) raw[+i] = { ...raw[+i], ...o };
  return raw;
}

describe('assessReadiness', () => {
  it('is ready when the full body is visible', () => {
    const r = assessReadiness(toPoseFrame(standingRaw(), 0));
    expect(r.ready).toBe(true);
    expect(r.guidance).toBe('READY');
  });

  it('asks to step back when ankles are low-confidence', () => {
    const r = assessReadiness(
      toPoseFrame(standingRaw({ [LANDMARK_INDEX.leftAnkle]: { visibility: 0.2 } }), 0),
    );
    expect(r.ready).toBe(false);
    expect(r.parts.ankles).toBe(false);
    expect(r.guidance).toBe('STEP_BACK');
  });

  it('treats ankles outside the frame edge as not visible', () => {
    const r = assessReadiness(toPoseFrame(standingRaw({ [LANDMARK_INDEX.rightAnkle]: { y: 1.04 } }), 0));
    expect(r.parts.ankles).toBe(false);
    expect(r.guidance).toBe('STEP_BACK');
  });

  it('reports no person when there is no frame', () => {
    expect(assessReadiness(null).guidance).toBe('NO_PERSON');
  });

  it('keeps anatomical left/right from MediaPipe indices (no mirroring)', () => {
    const f = toPoseFrame(standingRaw(), 0);
    // Subject facing the camera: their left side appears on image-right in the raw frame.
    expect(f.leftAnkle.x).toBeGreaterThan(f.rightAnkle.x);
  });
});
