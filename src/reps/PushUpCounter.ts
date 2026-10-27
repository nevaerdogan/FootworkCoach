/**
 * PUSH-UP COUNTER (side view).
 *
 * Depth = elbow angle (shoulder–elbow–wrist) mapped from straight arms (0) to the ideal bottom (1).
 * The same angle rule as common pose-based rep counters (up ≈ 145–160°, down ≈ 90–100°), with
 * hysteresis so a rep is only counted after the arms straighten again. The torso must lie near the
 * floor line, so flexing the arms while standing never counts. Form is judged but never blocks a
 * rep: sagging or piked hips produce a hint.
 */
import { clamp01 } from '../math';
import { REP_CONFIG } from '../config';
import type { PoseFrame } from '../pose/types';
import { DepthCounter, type Measurement } from './DepthCounter';
import { angleAt, inclineDeg, joint, jointVec, type Side } from './geometry';
import type { RepEvent } from './RepCounter';

export class PushUpCounter extends DepthCounter {
  readonly id = 'PUSH_UP' as const;
  /** Straightest-to-worst body line seen during the current rep. */
  private bodyMin = 180;

  constructor(cfg = REP_CONFIG) {
    super(cfg.pushUp, ['shoulder', 'elbow', 'wrist', 'hip'], ['shoulder', 'elbow', 'wrist', 'hip'], cfg);
  }

  protected measure(frame: PoseFrame, side: Side): Measurement {
    const P = this.cfg.pushUp;
    const shoulder = jointVec(frame, side, 'shoulder');
    const elbow = jointVec(frame, side, 'elbow');
    const wrist = jointVec(frame, side, 'wrist');
    const hip = jointVec(frame, side, 'hip');

    if (inclineDeg(hip, shoulder) > P.maxTorsoIncline) return { depth: 0, posture: 'Get into the push-up position' };

    if (!this.active) this.bodyMin = 180;
    const ankle = joint(frame, side, 'ankle');
    if (ankle.visibility >= this.cfg.minVisibility) {
      this.bodyMin = Math.min(this.bodyMin, angleAt(shoulder, hip, jointVec(frame, side, 'ankle')));
    }

    const angle = angleAt(shoulder, elbow, wrist);
    return { depth: clamp01((P.upAngle - angle) / (P.upAngle - P.downAngle)), posture: null };
  }

  protected hintFor(event: RepEvent): string | null {
    if (event.kind === 'partial') return 'Go lower';
    return this.bodyMin < this.cfg.pushUp.straightBodyAngle ? 'Keep your body straight' : null;
  }
}
