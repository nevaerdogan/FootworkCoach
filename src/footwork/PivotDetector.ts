/**
 * HEURISTIC PIVOT DETECTION.
 *
 * A front-facing 2D camera cannot reliably tell rotation direction from the image alone
 * (shoulders look narrower whichever way you turn). MediaPipe's world landmarks add a rough
 * depth estimate per joint, which resolves the direction. We estimate body yaw from both the
 * shoulder and the hip line, and call it a pivot when the rotation is large while the hips
 * stay roughly in place. This is an approximation, not professional pivot analysis;
 * all thresholds live in FOOTWORK_CONFIG.
 */
import { FOOTWORK_CONFIG } from '../config';
import { PIVOT_MOVEMENTS, type MovementDefinition } from '../movements';
import type { PoseFrame, WorldPoint } from '../pose/types';
import { clamp01, type Classification } from './classifier';

export interface BodyYaw {
  /** Degrees. 0 = square to the camera; + = turned toward the user's left (counter-clockwise from above). */
  shoulder: number;
  hip: number;
}

/**
 * Yaw of the right→left axis in the x–z plane. A user facing the camera has their left side at
 * +x. Turning toward their left pushes the left side away from the camera (z grows), so
 * atan2(Δz, Δx) is positive for a counter-clockwise turn.
 */
const axisYaw = (left: WorldPoint, right: WorldPoint) =>
  (Math.atan2(left.z - right.z, left.x - right.x) * 180) / Math.PI;

export function bodyYaw(frame: PoseFrame): BodyYaw | null {
  const w = frame.world;
  if (!w) return null;
  return { shoulder: axisYaw(w.leftShoulder, w.rightShoulder), hip: axisYaw(w.leftHip, w.rightHip) };
}

/** Signed smallest difference a − b in degrees, in (−180, 180]. */
export function angleDelta(a: number, b: number): number {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/** Combined rotation from shoulder and hip yaw deltas. */
export function combinedRotation(delta: BodyYaw, cfg = FOOTWORK_CONFIG): number {
  const w = cfg.yawShoulderWeight;
  return delta.shoulder * w + delta.hip * (1 - w);
}

/** Angle-aware EMA so smoothing never jumps across ±180°. */
export class YawSmoother {
  private v: BodyYaw | null = null;

  constructor(private alpha: number) {}

  push(y: BodyYaw): BodyYaw {
    if (!this.v) return (this.v = { ...y });
    const a = this.alpha;
    this.v = {
      shoulder: this.v.shoulder + a * angleDelta(y.shoulder, this.v.shoulder),
      hip: this.v.hip + a * angleDelta(y.hip, this.v.hip),
    };
    return this.v;
  }

  reset() {
    this.v = null;
  }
}

/**
 * Classifies a completed rotation. Returns null when it is not a pivot (rotation too small
 * or the hips travelled too far — then it is a step, possibly with some turn).
 */
export function classifyPivot(
  delta: BodyYaw,
  hipTranslation: number,
  candidates: MovementDefinition[] = PIVOT_MOVEMENTS,
  cfg = FOOTWORK_CONFIG,
): Classification | null {
  const rotation = combinedRotation(delta, cfg);
  if (Math.abs(rotation) < cfg.pivotAngleThreshold || hipTranslation > cfg.pivotMaxTranslation) return null;
  const def = candidates.find((c) => Math.sign(c.rotation) === Math.sign(rotation));
  if (!def) return null;

  // Direction confidence: shoulders and hips should agree on the turn direction,
  // and the hips should stay in place.
  const agree = Math.sign(delta.shoulder) === Math.sign(delta.hip);
  const agreement = agree ? 1 : 0.5;
  const stillness = 1 - 0.5 * clamp01(hipTranslation / cfg.pivotMaxTranslation);
  const directionConfidence = agreement * stillness;
  const magnitudeScore = clamp01(Math.abs(rotation) / Math.abs(def.rotation));
  return {
    type: def.id,
    directionConfidence,
    magnitudeScore,
    confidence: directionConfidence * 0.6 + magnitudeScore * 0.4,
    displacement: hipTranslation,
  };
}
