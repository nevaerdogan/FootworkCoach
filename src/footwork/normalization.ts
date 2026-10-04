import type { PoseFrame } from '../pose/types';
import type { BaselineState } from './baseline';
import { bodyPoints, type Vec2 } from './geometry';

/**
 * BODY-SPACE CONVENTION (analysis only, independent of display mirroring):
 *   lateral  + = the user's anatomical RIGHT.
 *              A user facing the camera has their right side at SMALLER raw-image x,
 *              so lateral = -(Δx).
 *   forward  + = toward the camera. Feet stepping toward the camera move DOWN in the
 *              image (larger y), so forward = +(Δy).
 *   units    multiples of baseline body scale (torso length), so camera distance
 *            does not change the numbers.
 */
export interface BodyVec {
  lateral: number;
  forward: number;
}

export function toBodySpace(p: Vec2, baseline: BaselineState, origin: Vec2 = baseline.stanceCenter): BodyVec {
  return {
    lateral: -(p.x - origin.x) / baseline.bodyScale,
    forward: (p.y - origin.y) / baseline.bodyScale,
  };
}

/** Normalized foot positions of a frame relative to the baseline stance center. */
export function normalizeFrame(frame: PoseFrame, baseline: BaselineState) {
  const p = bodyPoints(frame);
  return {
    leftAnkle: toBodySpace(p.leftAnkle, baseline),
    rightAnkle: toBodySpace(p.rightAnkle, baseline),
    stanceCenter: toBodySpace(p.stanceCenter, baseline),
    /** > 1 when the user is closer to the camera than at calibration (a forward-movement cue). */
    scaleRatio: p.torso / baseline.bodyScale,
  };
}
