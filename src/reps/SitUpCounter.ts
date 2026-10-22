/**
 * SIT-UP COUNTER (side view).
 *
 * Depth = torso angle above the floor line (hip→shoulder), from lying flat (0) to sitting up (1).
 * Chosen over the hip angle because the hip angle depends on how far the knees are bent, while
 * the torso line does not. Crunches that lift the shoulders only a little are reported as partial.
 * The legs must stay on the floor, so bending forward while standing never counts.
 */
import { REP_CONFIG } from '../config';
import type { PoseFrame } from '../pose/types';
import { clamp01, DepthCounter, type Measurement } from './DepthCounter';
import { inclineDeg, joint, jointVec, type Side } from './geometry';
import type { RepEvent } from './RepCounter';

export class SitUpCounter extends DepthCounter {
  readonly id = 'SIT_UP' as const;

  constructor(cfg = REP_CONFIG) {
    super(cfg.sitUp, ['shoulder', 'hip', 'knee', 'ankle'], ['shoulder', 'hip', 'knee'], cfg);
  }

  protected measure(frame: PoseFrame, side: Side): Measurement {
    const S = this.cfg.sitUp;
    const shoulder = jointVec(frame, side, 'shoulder');
    const hip = jointVec(frame, side, 'hip');
    const ankle = joint(frame, side, 'ankle');
    const legs =
      ankle.visibility >= this.cfg.minVisibility
        ? inclineDeg(hip, jointVec(frame, side, 'ankle')) > S.maxLegIncline
        : inclineDeg(hip, jointVec(frame, side, 'knee')) > S.maxThighIncline;
    if (legs) return { depth: 0, posture: 'Lie on your back, knees bent' };

    const torso = inclineDeg(hip, shoulder);
    return { depth: clamp01((torso - S.downAngle) / (S.upAngle - S.downAngle)), posture: null };
  }

  protected hintFor(event: RepEvent): string | null {
    return event.kind === 'partial' ? 'Come all the way up' : null;
  }
}
