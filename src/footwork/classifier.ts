import { FOOTWORK_CONFIG } from '../config';
import { STEP_MOVEMENTS, type MovementDefinition, type MovementId } from '../movements';
import type { BodyVec } from './normalization';

export interface Classification {
  type: MovementId;
  /** 0..1 — how closely the displacement direction matches the movement's direction. */
  directionConfidence: number;
  /** 0..1 — displacement relative to the movement's expected size (capped at 1). */
  magnitudeScore: number;
  /** 0..1 — combined. */
  confidence: number;
  /** Displacement magnitude in body-scale units (after forward gain). */
  displacement: number;
}

/**
 * Classifies a completed displacement (body space, forward gain already applied) as the
 * closest movement direction. `logScale` = ln(torso_end / torso_start): positive when the
 * user ended closer to the camera; used as a secondary forward/back cue.
 */
export function classifyDisplacement(
  d: BodyVec,
  logScale: number,
  candidates: MovementDefinition[] = STEP_MOVEMENTS,
  cfg = FOOTWORK_CONFIG,
): Classification | null {
  const mag = Math.hypot(d.lateral, d.forward);
  if (mag === 0 || candidates.length === 0) return null;

  // 1) Closest direction. 2) Among moves sharing that direction (step vs dash),
  //    the one whose expected size is closest to the measured size (log ratio).
  let best = candidates[0];
  let bestCos = -Infinity;
  for (const c of candidates) {
    const cos = (d.lateral * c.direction.lateral + d.forward * c.direction.forward) / mag;
    const sameDir = Math.abs(cos - bestCos) < 1e-9;
    const closerSize =
      sameDir &&
      Math.abs(Math.log(mag / c.detection.expectedDisplacement)) <
        Math.abs(Math.log(mag / best.detection.expectedDisplacement));
    if (cos > bestCos + 1e-9 || closerSize) {
      bestCos = cos;
      best = c;
    }
  }

  const minCos = Math.cos((cfg.directionToleranceDeg * Math.PI) / 180);
  let directionConfidence = clamp01((bestCos - minCos) / (1 - minCos));

  // Depth cue: stepping toward the camera should make the body look bigger, and vice versa.
  const fwd = best.direction.forward;
  if (fwd !== 0 && Math.sign(logScale) === -Math.sign(fwd) && Math.abs(logScale) > cfg.scaleCueTolerance) {
    directionConfidence *= cfg.scaleCuePenalty;
  }

  const magnitudeScore = clamp01(mag / best.detection.expectedDisplacement);
  return {
    type: best.id,
    directionConfidence,
    magnitudeScore,
    confidence: directionConfidence * 0.6 + magnitudeScore * 0.4,
    displacement: mag,
  };
}

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
