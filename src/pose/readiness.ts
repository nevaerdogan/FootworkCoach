import { READINESS_CONFIG } from '../config';
import type { Landmark, LandmarkName, PoseFrame } from './types';

export type BodyPart = 'head' | 'shoulders' | 'hips' | 'knees' | 'ankles';

export const BODY_PARTS: { id: BodyPart; label: string; landmarks: LandmarkName[] }[] = [
  { id: 'head', label: 'Head', landmarks: ['nose'] },
  { id: 'shoulders', label: 'Shoulders', landmarks: ['leftShoulder', 'rightShoulder'] },
  { id: 'hips', label: 'Hips', landmarks: ['leftHip', 'rightHip'] },
  { id: 'knees', label: 'Knees', landmarks: ['leftKnee', 'rightKnee'] },
  { id: 'ankles', label: 'Feet', landmarks: ['leftAnkle', 'rightAnkle'] },
];

export type Guidance = 'NO_PERSON' | 'STEP_BACK' | 'ADJUST' | 'READY';

export interface Readiness {
  parts: Record<BodyPart, boolean>;
  guidance: Guidance;
  ready: boolean;
}

export function isLandmarkVisible(lm: Landmark, cfg = READINESS_CONFIG): boolean {
  const m = cfg.edgeMargin;
  return (
    lm.visibility >= cfg.minVisibility && lm.x >= m && lm.x <= 1 - m && lm.y >= m && lm.y <= 1 - m
  );
}

export function assessReadiness(frame: PoseFrame | null, cfg = READINESS_CONFIG): Readiness {
  const parts = {} as Record<BodyPart, boolean>;
  for (const part of BODY_PARTS) {
    parts[part.id] = !!frame && part.landmarks.every((n) => isLandmarkVisible(frame[n], cfg));
  }
  const all = BODY_PARTS.every((p) => parts[p.id]);
  const upper = parts.shoulders || parts.hips;

  let guidance: Guidance;
  if (all) guidance = 'READY';
  else if (!frame || !upper) guidance = 'NO_PERSON';
  else if (!parts.ankles || !parts.knees) guidance = 'STEP_BACK';
  else guidance = 'ADJUST';

  return { parts, guidance, ready: all };
}

/** Stable key so the UI only re-renders when readiness actually changes. */
export function readinessKey(r: Readiness): string {
  return r.guidance + BODY_PARTS.map((p) => (r.parts[p.id] ? 1 : 0)).join('');
}

/**
 * Readiness for a conditioning exercise. `parts` lists what must be in frame while the athlete
 * stands at the spot. In a side view only one side of each pair is clearly visible, so a part
 * counts when either of its landmarks is; a front view needs both.
 */
export function assessExerciseReadiness(
  frame: PoseFrame | null,
  required: BodyPart[],
  view: 'side' | 'front',
  cfg = READINESS_CONFIG,
): Readiness {
  const parts = {} as Record<BodyPart, boolean>;
  for (const part of BODY_PARTS) {
    const visible = (n: LandmarkName) => !!frame && isLandmarkVisible(frame[n], cfg);
    parts[part.id] = view === 'side' ? part.landmarks.some(visible) : part.landmarks.every(visible);
  }
  const ready = required.every((id) => parts[id]);
  const upper = parts.shoulders || parts.hips;

  let guidance: Guidance;
  if (ready) guidance = 'READY';
  else if (!frame || !upper) guidance = 'NO_PERSON';
  else if ((required.includes('ankles') && !parts.ankles) || (required.includes('knees') && !parts.knees)) guidance = 'STEP_BACK';
  else guidance = 'ADJUST';

  return { parts, guidance, ready };
}
