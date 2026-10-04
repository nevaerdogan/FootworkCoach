import { BOUNCE_CONFIG, FOOTWORK_CONFIG, PUNCH_CONFIG, TRAINING_CONFIG } from '../config';
import { MOVEMENTS, type MovementDefinition } from '../movements';
import type { PoseFrame } from '../pose/types';
import type { BaselineState } from './baseline';
import { FootworkDetector, type DetectedMovement, type DetectorState } from './FootworkDetector';
import { BounceDetector } from './BounceDetector';
import { PunchDetector, punchAsMovement, type ArmSignal, type DetectedPunch } from './PunchDetector';

export interface AnalyzerUpdate {
  state: DetectorState;
  displacement: number;
  rotation: number;
  /** Completed movements this frame (footwork and/or punch), in order. */
  movements: DetectedMovement[];
  punch?: DetectedPunch;
  /** Live per-arm punch signal (debug). */
  arms?: Partial<Record<'left' | 'right', ArmSignal>>;
  /** A movement or punch is clearly underway (for early cue advance). */
  underway: boolean;
}

/**
 * Footwork + (optional) punch detection on the same frames. While an arm is active, body
 * rotation is ignored by the footwork detector, so a cross is never mistaken for a pivot.
 */
export class MotionAnalyzer {
  private footwork: FootworkDetector;
  private punches: PunchDetector | null;
  private punchAt = -Infinity;
  private bounces: BounceDetector | null;

  constructor(baseline: BaselineState, candidates?: MovementDefinition[], withPunches = true) {
    this.footwork = new FootworkDetector(baseline, candidates);
    this.punches = withPunches ? new PunchDetector(TRAINING_CONFIG.stance) : null;
    this.bounces = !candidates || candidates.some((c) => c.kind === 'rhythm') ? new BounceDetector() : null;
  }

  push(frame: PoseFrame | null): AnalyzerUpdate {
    const t = frame?.timestamp ?? 0;
    const pu = this.punches?.push(frame);
    // Ignore body rotation only while a punch is actually being thrown (and shortly after, while
    // the torso returns). Small arm movements must never hide a real pivot.
    if (pu?.extending || pu?.punch) this.punchAt = t;
    const suppressRotation = t - this.punchAt < PUNCH_CONFIG.suppressHoldMs;

    const u = this.footwork.push(frame, { suppressRotation });
    const movements: DetectedMovement[] = [];
    if (u.movement) {
      movements.push(u.movement);
      if (MOVEMENTS[u.movement.type].kind === 'switch' && !u.movement.unclear) this.punches?.switchStance();
    }
    if (pu?.punch) movements.push(punchAsMovement(pu.punch, FOOTWORK_CONFIG.minConfidence));
    const bounce = this.bounces?.push(frame);
    if (bounce) {
      movements.push({
        type: 'BOUNCE',
        directionConfidence: 1,
        magnitudeScore: Math.min(1, bounce.amplitude / BOUNCE_CONFIG.goodAmplitude),
        confidence: bounce.clear ? 1 : 0.6,
        displacement: bounce.amplitude,
        vector: { lateral: 0, forward: 0 },
        startTime: bounce.t,
        endTime: bounce.t,
        duration: 0,
        firstFoot: null,
        footOrder: 'unknown',
        rotation: 0,
        unclear: false,
        path: [],
      });
    }

    const stepping =
      u.state === 'MOVEMENT_IN_PROGRESS' &&
      (u.displacement >= FOOTWORK_CONFIG.minDisplacement || Math.abs(u.rotation) >= FOOTWORK_CONFIG.pivotAngleThreshold * 0.7);
    return {
      state: u.state,
      displacement: u.displacement,
      rotation: u.rotation,
      movements,
      punch: pu?.punch,
      arms: pu?.arms,
      underway: !movements.some((m) => m.type !== 'BOUNCE') && (stepping || !!pu?.extending),
    };
  }
}
