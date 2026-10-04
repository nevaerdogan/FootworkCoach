/**
 * HEURISTIC PUNCH DETECTION (jab / cross).
 *
 * Uses MediaPipe world landmarks (meters). For each arm:
 *   extension = |shoulder→wrist| / (|shoulder→elbow| + |elbow→wrist|)   ~0.5 in guard, ~1 straight
 *   forward   = shoulder.z − wrist.z   (z smaller = closer to camera)
 *   spread    = 2D wrist distance from its guard position, in torso lengths
 *
 * A punch thrown straight at the camera is exactly where monocular depth is weakest: MediaPipe
 * compresses it, so absolute thresholds miss real punches. Detection is therefore RELATIVE to
 * each arm's own guard (learned continuously while the arm is at rest): a punch is a quick rise
 * in extension / reach / wrist travel above guard, followed by a return.
 *
 * One punch at a time; the arm that moved most decides jab vs cross. Lead arm → JAB, rear → CROSS.
 * Judges reach and timing only, not punching technique.
 */
import { PUNCH_CONFIG, TRAINING_CONFIG, type Stance } from '../config';
import type { MovementId } from '../movements';
import type { PoseFrame, WorldPoint } from '../pose/types';
import { clamp01 } from './classifier';
import type { DetectedMovement } from './FootworkDetector';
import { bodyPoints } from './geometry';
import { angleDelta, bodyYaw } from './PivotDetector';

export type Arm = 'left' | 'right';

export interface DetectedPunch {
  type: MovementId;
  arm: Arm;
  startTime: number;
  endTime: number;
  duration: number;
  /** Peak extension ratio. */
  extension: number;
  /** Peak forward reach toward the camera (m). */
  reach: number;
  confidence: number;
}

export interface ArmSignal {
  ext: number;
  forward: number;
  /** Punch strength above guard (1 = clear punch). */
  score: number;
}

export interface PunchUpdate {
  /** A punch is out right now (for early cue advance). */
  extending: boolean;
  /** Either arm is leaving guard: the torso may be rotating for a punch, not a pivot. */
  armActive: boolean;
  punch?: DetectedPunch;
  /** Per-arm live signal (debug). */
  arms?: Partial<Record<Arm, ArmSignal>>;
}

const dist3 = (a: WorldPoint, b: WorldPoint) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export function armExtension(shoulder: WorldPoint, elbow: WorldPoint, wrist: WorldPoint) {
  const limb = dist3(shoulder, elbow) + dist3(elbow, wrist);
  return {
    extension: limb > 0 ? dist3(shoulder, wrist) / limb : 0,
    forward: shoulder.z - wrist.z,
  };
}

interface ArmTrack {
  ext: number | null;
  fwd: number;
  /** Learned guard (rest) values. */
  guardExt: number | null;
  guardFwd: number;
  guardX: number;
  guardY: number;
  score: number;
  /** Last time the score was low: punch start candidate. */
  restSince: number;
  /** Wrist reach toward the camera in the hip-centered frame (−z, m), and its guard value. */
  hip: number | null;
  guardHip: number | null;
  /** Since when the score has been ≥ 1 (a punch must stay out for minOutMs, not a one-frame spike). */
  aboveSince: number | null;
}

interface ActivePunch {
  arm: Arm;
  start: number;
  outSince: number;
  peakScore: Record<Arm, number>;
  peakExt: Record<Arm, number>;
  peakReach: Record<Arm, number>;
  /** Guard yaw when the punch started, and the extreme turns since (deg, + = toward a rear-hand punch). */
  yaw0: number | null;
  maxTurn: number;
  minTurn: number;
  /** Peak hand travel toward the camera relative to the hips, per arm (m). */
  peakHipGain: Record<Arm, number>;
}

const freshTrack = (): ArmTrack => ({
  ext: null,
  fwd: 0,
  guardExt: null,
  guardFwd: 0,
  guardX: 0,
  guardY: 0,
  score: 0,
  restSince: 0,
  hip: null,
  guardHip: null,
  aboveSince: null,
});

export class PunchDetector {
  private track: Record<Arm, ArmTrack> = { left: freshTrack(), right: freshTrack() };
  private active: ActivePunch | null = null;
  private quietUntil = 0;
  /** Arm that was held out too long: must return to guard before any new punch. */
  private blocked: Arm | null = null;
  private lead: Arm;
  /** +1 if a rear-hand punch turns the shoulders counter-clockwise (orthodox), −1 for southpaw. */
  private crossTurnSign: number;
  private yaw: number | null = null;
  private guardYaw: number | null = null;

  constructor(
    stance: Stance = TRAINING_CONFIG.stance,
    private cfg = PUNCH_CONFIG,
  ) {
    this.lead = stance === 'orthodox' ? 'left' : 'right';
    this.crossTurnSign = stance === 'orthodox' ? 1 : -1;
  }

  /** After a stance switch the lead hand changes (jab ↔ cross) and so does the cross turn. */
  switchStance() {
    this.lead = this.lead === 'left' ? 'right' : 'left';
    this.crossTurnSign = -this.crossTurnSign;
  }

  push(frame: PoseFrame | null): PunchUpdate {
    const w = frame?.world;
    // Arms need all four world points; otherwise skip (never throw inside the camera loop).
    if (!frame || !w || !w.leftElbow || !w.leftWrist || !w.rightElbow || !w.rightWrist) {
      return { extending: false, armActive: false };
    }
    const t = frame.timestamp;
    const torso = bodyPoints(frame).torso || 1;
    const C = this.cfg;

    // Cues that don't need a visible wrist: hand reach in the hip frame and shoulder yaw.
    // (The rear hand is often hidden behind the body in a bladed stance.)
    for (const arm of ['left', 'right'] as const) {
      const tr = this.track[arm];
      const reach = -(arm === 'left' ? w.leftWrist.z : w.rightWrist.z);
      tr.hip = tr.hip === null ? reach : tr.hip + C.alpha * (reach - tr.hip);
      tr.guardHip ??= tr.hip;
    }
    const y = bodyYaw(frame)?.shoulder ?? null;
    if (y !== null) this.yaw = this.yaw === null ? y : this.yaw + C.alpha * angleDelta(y, this.yaw);
    if (this.guardYaw === null) this.guardYaw = this.yaw;

    const arms: Partial<Record<Arm, ArmSignal>> = {};
    for (const arm of ['left', 'right'] as const) {
      const tr = this.track[arm];
      const wrist2d = arm === 'left' ? frame.leftWrist : frame.rightWrist;
      const punching = this.active?.arm === arm;
      // Fast punches blur and visibility dips at the peak: keep tracking an arm mid-punch.
      if (wrist2d.visibility < C.minVisibility && !punching) {
        tr.ext = null;
        continue;
      }
      const raw =
        arm === 'left'
          ? armExtension(w.leftShoulder, w.leftElbow, w.leftWrist)
          : armExtension(w.rightShoulder, w.rightElbow, w.rightWrist);
      const first = tr.ext === null;
      tr.ext = first ? raw.extension : tr.ext! + C.alpha * (raw.extension - tr.ext!);
      tr.fwd = first ? raw.forward : tr.fwd + C.alpha * (raw.forward - tr.fwd);
      // Wrist position relative to its own shoulder, so stepping or turning the whole body doesn't count.
      const sh2d = arm === 'left' ? frame.leftShoulder : frame.rightShoulder;
      const wx = (wrist2d.x - sh2d.x) * frame.aspect;
      const wy = wrist2d.y - sh2d.y;
      if (tr.guardExt === null) {
        tr.guardExt = tr.ext;
        tr.guardFwd = tr.fwd;
        tr.guardX = wx;
        tr.guardY = wy;
      }

      // Punch strength: the best of four cues, three of them relative to this arm's guard.
      const dExt = tr.ext - tr.guardExt;
      const dFwd = tr.fwd - tr.guardFwd;
      const spread = Math.hypot(wx - tr.guardX, wy - tr.guardY) / torso;
      // Wrist travel alone (2D) counts a bit less unless depth/extension agree.
      const spreadScore = (spread / C.spreadRise) * (dExt > 0.04 || dFwd > 0.03 ? 1 : 0.6);
      const absolute = tr.ext > C.extendOn && tr.fwd > C.minForward ? 1 : 0;
      // (Hip-frame reach is NOT a trigger: whole-body rotation moves it too. It only decides jab vs cross.)
      tr.score = Math.max(dExt / C.extRise, dFwd / C.fwdRise, spreadScore, absolute);
      if (tr.score < C.restScore) tr.restSince = t;
      if (tr.score >= 1) tr.aboveSince ??= t;
      else tr.aboveSince = null;

      // Learn the guard slowly while the arm is at rest (never during a punch).
      if (!punching && tr.score < C.restScore) {
        const g = C.guardAlpha;
        tr.guardExt += g * (tr.ext - tr.guardExt);
        tr.guardFwd += g * (tr.fwd - tr.guardFwd);
        tr.guardX += g * (wx - tr.guardX);
        tr.guardY += g * (wy - tr.guardY);
      }
      arms[arm] = { ext: tr.ext, forward: tr.fwd, score: tr.score };
    }
    const armActive = (arms.left?.score ?? 0) > C.activeScore || (arms.right?.score ?? 0) > C.activeScore;
    if (this.blocked && (arms[this.blocked]?.score ?? 0) < C.restScore) this.blocked = null;

    // Learn hip-frame reach and shoulder yaw at rest (never during a punch).
    if (!this.active) {
      const g = C.guardAlpha;
      for (const arm of ['left', 'right'] as const) {
        const tr = this.track[arm];
        if ((arms[arm]?.score ?? 0) < C.restScore && tr.hip !== null && tr.guardHip !== null) {
          tr.guardHip += g * (tr.hip - tr.guardHip);
        }
      }
      if (!armActive && this.yaw !== null && this.guardYaw !== null) {
        this.guardYaw += g * angleDelta(this.yaw, this.guardYaw);
      }
    }
    const hipGain = (arm: Arm) => (this.track[arm].hip ?? 0) - (this.track[arm].guardHip ?? 0);
    const turn = () =>
      this.yaw !== null && this.active?.yaw0 != null ? angleDelta(this.yaw, this.active.yaw0) * this.crossTurnSign : 0;

    // Start: an arm clearly out of guard, outside the refractory window.
    if (!this.active) {
      if (t >= this.quietUntil && !this.blocked) {
        const out = (['left', 'right'] as const)
          .filter((a) => (arms[a]?.score ?? 0) >= 1 && t - (this.track[a].aboveSince ?? t) >= C.minOutMs)
          .sort((a, b) => arms[b]!.score - arms[a]!.score)[0];
        if (out) {
          const peak = (k: keyof ArmSignal) => ({ left: arms.left?.[k] ?? 0, right: arms.right?.[k] ?? 0 });
          this.active = {
            arm: out,
            start: this.track[out].restSince,
            outSince: t,
            peakScore: peak('score'),
            peakExt: peak('ext'),
            peakReach: peak('forward'),
            yaw0: this.guardYaw,
            maxTurn: 0,
            minTurn: 0,
            peakHipGain: { left: hipGain('left'), right: hipGain('right') },
          };
          const tn = turn();
          this.active.maxTurn = Math.max(0, tn);
          this.active.minTurn = Math.min(0, tn);
        }
      }
      return { extending: false, armActive, arms };
    }

    // While out: track both arms' peaks; complete when the punching arm is back near guard.
    const a = this.active;
    for (const arm of ['left', 'right'] as const) {
      const s = arms[arm];
      if (!s) continue;
      a.peakScore[arm] = Math.max(a.peakScore[arm], s.score);
      a.peakExt[arm] = Math.max(a.peakExt[arm], s.ext);
      a.peakReach[arm] = Math.max(a.peakReach[arm], s.forward);
    }
    for (const arm of ['left', 'right'] as const) a.peakHipGain[arm] = Math.max(a.peakHipGain[arm], hipGain(arm));
    const tn = turn();
    a.maxTurn = Math.max(a.maxTurn, tn);
    a.minTurn = Math.min(a.minTurn, tn);
    if ((arms[a.arm]?.score ?? 0) >= C.retractScore) {
      if (t - a.outSince > C.maxPunchMs) {
        // Held out: not a punch. Wait for that arm to come back to guard.
        this.blocked = a.arm;
        this.active = null;
      }
      return { extending: !!this.active, armActive: true, arms };
    }

    this.active = null;
    this.quietUntil = t + C.refractoryMs;
    const duration = t - a.start;
    if (duration < C.minPunchMs) return { extending: false, armActive, arms };
    const arm = this.whichArm(a);
    return {
      extending: false,
      armActive,
      arms,
      punch: {
        type: arm === this.lead ? 'JAB' : 'CROSS',
        arm,
        startTime: a.start,
        endTime: t,
        duration,
        extension: a.peakExt[arm],
        reach: a.peakReach[arm],
        // 0.5 right at the detection threshold, 1.0 for a clear punch (score ≥ 1.5).
        confidence: clamp01(0.5 + (Math.max(a.peakScore.left, a.peakScore.right) - 1)),
      },
    };
  }

  /**
   * Which hand threw it, by evidence strength:
   *   1. Shoulder turn: a rear-hand punch turns the shoulders toward the lead side; a jab hardly does.
   *   2. Hand travel toward the camera relative to the hips (works even if the wrist is occluded).
   *   3. Fallback: the arm whose own signal rose most.
   */
  private whichArm(a: ActivePunch): Arm {
    const C = this.cfg;
    const rear: Arm = this.lead === 'left' ? 'right' : 'left';
    if (a.maxTurn >= C.crossTurnDeg && a.maxTurn > -a.minTurn) return rear;
    const gLead = a.peakHipGain[this.lead];
    const gRear = a.peakHipGain[rear];
    if (Math.abs(gLead - gRear) >= C.reachMargin) return gRear > gLead ? rear : this.lead;
    return a.peakScore.left >= a.peakScore.right ? 'left' : 'right';
  }
}

/** Express a punch in the common movement-result shape used by the session and scoring. */
export function punchAsMovement(p: DetectedPunch, minConfidence = 0.35): DetectedMovement {
  return {
    type: p.type,
    directionConfidence: p.confidence,
    magnitudeScore: clamp01(p.extension),
    confidence: p.confidence,
    // For punches, scoring reads "displacement" as reach; a clear punch counts as full reach
    // even when MediaPipe compresses depth.
    displacement: Math.max(p.extension, 0.92 * p.confidence),
    vector: { lateral: 0, forward: 0 },
    startTime: p.startTime,
    endTime: p.endTime,
    duration: p.duration,
    firstFoot: null,
    footOrder: 'unknown',
    rotation: 0,
    unclear: p.confidence < minConfidence,
    path: [],
  };
}
