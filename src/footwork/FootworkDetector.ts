import { FOOTWORK_CONFIG } from '../config';
import { MOVEMENT_LIST, type MovementDefinition } from '../movements';
import { isLandmarkVisible } from '../pose/readiness';
import type { PoseFrame } from '../pose/types';
import type { BaselineState } from './baseline';
import { clamp01, classifyDisplacement, type Classification } from './classifier';
import { angleDelta, bodyYaw, classifyPivot, combinedRotation, YawSmoother, type BodyYaw } from './PivotDetector';
import { bodyPoints, mid, type Vec2 } from './geometry';
import type { BodyVec } from './normalization';
import { MovementStateMachine, type MovementState } from './MovementStateMachine';
import { EmaVec2 } from './smoothing';

export type DetectorState = 'LOW_CONFIDENCE' | MovementState;
export type Foot = 'left' | 'right';

export interface FootSample {
  t: number;
  /** Body space relative to the movement's start stance center (no forward gain: true proportions). */
  left: BodyVec;
  right: BodyVec;
}

export interface DetectedMovement extends Classification {
  /** Stance-center displacement in body space (forward gain applied). */
  vector: BodyVec;
  startTime: number;
  endTime: number;
  duration: number;
  firstFoot: Foot | null;
  footOrder: 'left-first' | 'right-first' | 'together' | 'unknown';
  /** Combined body rotation during the movement (deg, + = toward the user's left). */
  rotation: number;
  /** True when confidence is below the configured minimum: do not trust the type. */
  unclear: boolean;
  path: FootSample[];
}

export interface PushOptions {
  /**
   * Ignore body rotation (e.g. while a punch is thrown: a cross turns the torso 30–40°,
   * which must not be read as a pivot). The reference yaw follows the body meanwhile.
   */
  suppressRotation?: boolean;
}

export interface DetectorUpdate {
  state: DetectorState;
  /** Current stance-center displacement from the reference (debug / HUD). */
  displacement: number;
  /** Current rotation from the reference (deg). */
  rotation: number;
  movement?: DetectedMovement;
}

interface Reference {
  center: Vec2;
  left: Vec2;
  right: Vec2;
  hip: Vec2;
  torso: number;
  yaw: BodyYaw | null;
}

/**
 * Temporal footwork detector. Never classifies from a single frame: it keeps a reference
 * stance, waits for the feet to leave it, then waits for them to plant again, and only then
 * classifies the whole displacement. The new planted stance becomes the next reference
 * (dynamically updated stance), so the same step is never reported twice.
 *
 * Pure TypeScript: no React, no DOM. Feed it frames; it returns events.
 */
export class FootworkDetector {
  private emaL: EmaVec2;
  private emaR: EmaVec2;
  private yawSm: YawSmoother;
  private steps: MovementDefinition[];
  private pivots: MovementDefinition[];
  private switches: MovementDefinition[];
  private torso: number;
  private ref: Reference | null = null;
  private prev: { t: number; left: Vec2; right: Vec2 } | null = null;
  private yawHistory: { t: number; yaw: BodyYaw }[] = [];
  private machine: MovementStateMachine;
  private footStart: Record<Foot, number | null> = { left: null, right: null };
  private moveStart = 0;
  private lostSince: number | null = null;
  private path: FootSample[] = [];

  constructor(
    private baseline: BaselineState,
    candidates: MovementDefinition[] = MOVEMENT_LIST,
    private cfg = FOOTWORK_CONFIG,
  ) {
    this.steps = candidates.filter((c) => c.kind === 'step');
    this.pivots = candidates.filter((c) => c.kind === 'pivot');
    this.switches = candidates.filter((c) => c.kind === 'switch');
    this.emaL = new EmaVec2(cfg.emaAlpha);
    this.emaR = new EmaVec2(cfg.emaAlpha);
    this.yawSm = new YawSmoother(cfg.yawAlpha);
    this.torso = baseline.bodyScale;
    this.machine = new MovementStateMachine(cfg);
  }

  get currentState(): MovementState {
    return this.machine.state;
  }

  push(frame: PoseFrame | null, opts: PushOptions = {}): DetectorUpdate {
    if (!frame || !isLandmarkVisible(frame.leftAnkle) || !isLandmarkVisible(frame.rightAnkle)) {
      return this.handleLost(frame?.timestamp ?? this.prev?.t ?? 0);
    }
    this.lostSince = null;

    const t = frame.timestamp;
    const p = bodyPoints(frame);
    const left = this.emaL.push(p.leftAnkle);
    const right = this.emaR.push(p.rightAnkle);
    this.torso += this.cfg.emaAlpha * (p.torso - this.torso);
    const center = mid(left, right);
    const hip = p.hipCenter;
    const rawYaw = bodyYaw(frame);
    const yaw = rawYaw ? this.yawSm.push(rawYaw) : null;

    if (!this.ref) {
      this.ref = { center, left, right, hip, torso: this.torso, yaw };
      this.prev = { t, left, right };
      this.machine.abort();
      return { state: 'IDLE', displacement: 0, rotation: 0 };
    }

    if (opts.suppressRotation) {
      this.ref.yaw = yaw;
      this.yawHistory = [];
    }
    const ref = this.ref;
    const dt = Math.max(1, t - (this.prev?.t ?? t - 33)) / 1000;
    const velocity = this.prev
      ? Math.max(mag(this.rel(left, this.prev.left)), mag(this.rel(right, this.prev.right))) / dt
      : 0;
    const yawVelocity = opts.suppressRotation ? 0 : this.yawVelocity(t, yaw);
    this.prev = { t, left, right };

    const disp = this.rel(center, ref.center);
    const dispMag = mag(disp);
    const yawDelta = yaw && ref.yaw && !opts.suppressRotation ? yawDiff(yaw, ref.yaw) : null;
    const rotation = yawDelta ? combinedRotation(yawDelta, this.cfg) : 0;
    const planted = velocity < this.cfg.settleVelocity && yawVelocity < this.cfg.settleYawVelocity;

    // Per-foot start times (tracked even before the movement officially starts, for foot order).
    const idle = this.machine.state === 'IDLE';
    for (const foot of ['left', 'right'] as const) {
      const moved = mag(this.rel(foot === 'left' ? left : right, ref[foot])) > this.cfg.footStartThreshold;
      if (moved) this.footStart[foot] ??= t;
      else if (idle) this.footStart[foot] = null;
    }

    const footMoved = Math.max(mag(this.rel(left, ref.left)), mag(this.rel(right, ref.right)));
    const active =
      dispMag > this.cfg.startThreshold ||
      Math.abs(rotation) > this.cfg.pivotStartDeg ||
      (this.switches.length > 0 && footMoved > this.cfg.footActiveThreshold);
    // Step-drag: when only one foot has moved, keep waiting a little longer for the other to
    // follow, so one step is never reported as two moves.
    const oneFootOnly = (this.footStart.left === null) !== (this.footStart.right === null);
    const waitForFollow = oneFootOnly && Math.abs(rotation) < this.cfg.pivotAngleThreshold * 0.6;
    const out = this.machine.step({ t, active, planted, settleMs: waitForFollow ? this.cfg.followWaitMs : this.cfg.settleMs });
    const current = { center, left, right, hip, torso: this.torso, yaw };

    switch (out.event) {
      case 'STARTED':
        this.moveStart = Math.min(t, this.footStart.left ?? t, this.footStart.right ?? t);
        this.path = [];
        break;
      case 'COMPLETED':
      case 'TIMED_OUT': {
        const hipTranslation = mag(this.rel(hip, ref.hip));
        const order = { from: this.footOrderDepth(ref.left, ref.right, ref.torso), to: this.footOrderDepth(left, right, ref.torso) };
        const movement = this.complete(disp, out.endTime!, Math.log(this.torso / ref.torso), yawDelta, hipTranslation, order);
        this.ref = current;
        this.resetMovement();
        return { state: out.state, displacement: dispMag, rotation, movement: movement ?? undefined };
      }
    }

    if (this.machine.isMoving) {
      this.path.push({ t, left: this.bodyRel(left), right: this.bodyRel(right) });
    } else if (out.state === 'RECOVERY') {
      // Feet are finishing their landing: follow them so residual motion isn't the next "step".
      this.ref = current;
      this.footStart = { left: null, right: null };
    } else if (planted) {
      this.drift(center, left, right, hip, yaw);
    }
    return { state: out.state, displacement: dispMag, rotation };
  }

  /** Re-anchor the reference stance (e.g. at the start of a training sequence). */
  rebase() {
    this.ref = null;
    this.emaL.reset();
    this.emaR.reset();
    this.yawSm.reset();
    this.yawHistory = [];
    this.machine.abort();
    this.resetMovement();
  }

  private complete(
    disp: BodyVec,
    endTime: number,
    logScale: number,
    yawDelta: BodyYaw | null,
    hipTranslation: number,
    order: { from: number; to: number } = { from: 0, to: 0 },
  ): DetectedMovement | null {
    const duration = endTime - this.moveStart;
    if (duration < this.cfg.minDurationMs) return null;
    // Stance change first: the feet's front/back order flipped (a pivot keeps the lead foot planted).
    const sw = this.classifySwitch(disp, order);
    if (sw) {
      const { firstFoot, footOrder } = this.footOrder();
      return {
        ...sw,
        vector: disp,
        startTime: this.moveStart,
        endTime,
        duration,
        firstFoot,
        footOrder,
        rotation: yawDelta ? combinedRotation(yawDelta, this.cfg) : 0,
        unclear: sw.confidence < this.cfg.minConfidence,
        path: this.path,
      };
    }
    // Pivot first: large rotation with the hips in place. Otherwise it's a step (if big enough).
    const pivot = yawDelta && this.pivots.length ? classifyPivot(yawDelta, hipTranslation, this.pivots, this.cfg) : null;
    const c =
      pivot ??
      (mag(disp) >= this.cfg.minDisplacement ? classifyDisplacement(disp, logScale, this.steps, this.cfg) : null);
    if (!c) return null;
    const { firstFoot, footOrder } = this.footOrder();
    return {
      ...c,
      vector: disp,
      startTime: this.moveStart,
      endTime,
      duration,
      firstFoot,
      footOrder,
      rotation: yawDelta ? combinedRotation(yawDelta, this.cfg) : 0,
      unclear: c.confidence < this.cfg.minConfidence,
      path: this.path,
    };
  }

  /** + when the left ankle is in front (closer to the camera = lower in the image): orthodox. */
  private footOrderDepth(left: Vec2, right: Vec2, torso: number): number {
    return (left.y - right.y) / torso;
  }

  private classifySwitch(disp: BodyVec, order: { from: number; to: number }): Classification | null {
    if (!this.switches.length) return null;
    const gap = this.cfg.switchMinGap;
    const flipped = Math.sign(order.from) !== Math.sign(order.to) && Math.abs(order.from) >= gap && Math.abs(order.to) >= gap;
    if (!flipped) return null;
    const moved = disp.forward >= this.cfg.minDisplacement;
    const def = this.switches.find((s) => (moved ? s.direction.forward > 0 : s.direction.forward === 0)) ?? this.switches[0];
    // Confidence: how clear both stances were, and (for a shift) how far forward it travelled.
    const clarity = clamp01(Math.min(Math.abs(order.from), Math.abs(order.to)) / (2 * gap));
    const magnitudeScore = def.direction.forward > 0 ? clamp01(disp.forward / def.detection.expectedDisplacement) : 1;
    const directionConfidence = 0.5 + 0.5 * clarity;
    return {
      type: def.id,
      directionConfidence,
      magnitudeScore,
      confidence: directionConfidence * 0.6 + magnitudeScore * 0.4,
      displacement: Math.hypot(disp.lateral, disp.forward),
    };
  }

  private footOrder(): Pick<DetectedMovement, 'firstFoot' | 'footOrder'> {
    const { left: l, right: r } = this.footStart;
    if (l === null && r === null) return { firstFoot: null, footOrder: 'unknown' };
    if (l !== null && r !== null && Math.abs(l - r) <= this.cfg.footTogetherMs) {
      return { firstFoot: null, footOrder: 'together' };
    }
    const first: Foot = r === null || (l !== null && l < r) ? 'left' : 'right';
    return { firstFoot: first, footOrder: first === 'left' ? 'left-first' : 'right-first' };
  }

  /** Rotation speed (deg / s) over a short window, robust to per-frame depth noise. */
  private yawVelocity(t: number, yaw: BodyYaw | null): number {
    if (!yaw) {
      this.yawHistory = [];
      return 0;
    }
    this.yawHistory.push({ t, yaw });
    while (this.yawHistory.length > 2 && t - this.yawHistory[1].t >= this.cfg.yawVelocityWindowMs) {
      this.yawHistory.shift();
    }
    const oldest = this.yawHistory[0];
    const span = (t - oldest.t) / 1000;
    return span > 0.05 ? Math.abs(combinedRotation(yawDiff(yaw, oldest.yaw), this.cfg)) / span : 0;
  }

  private handleLost(t: number): DetectorUpdate {
    this.lostSince ??= t;
    if (this.machine.isMoving && t - this.lostSince > this.cfg.lostTimeoutMs) {
      // Can't trust a movement we lost track of: drop it and re-anchor when feet return.
      this.rebase();
    }
    return { state: 'LOW_CONFIDENCE', displacement: 0, rotation: 0 };
  }

  private resetMovement() {
    this.footStart = { left: null, right: null };
    this.path = [];
    this.prev = null;
  }

  private drift(center: Vec2, left: Vec2, right: Vec2, hip: Vec2, yaw: BodyYaw | null) {
    const a = this.cfg.restDriftAlpha;
    const ref = this.ref!;
    const lerp = (from: Vec2, to: Vec2) => ({ x: from.x + a * (to.x - from.x), y: from.y + a * (to.y - from.y) });
    this.ref = {
      center: lerp(ref.center, center),
      left: lerp(ref.left, left),
      right: lerp(ref.right, right),
      hip: lerp(ref.hip, hip),
      torso: ref.torso + a * (this.torso - ref.torso),
      yaw:
        ref.yaw && yaw
          ? { shoulder: ref.yaw.shoulder + a * angleDelta(yaw.shoulder, ref.yaw.shoulder), hip: ref.yaw.hip + a * angleDelta(yaw.hip, ref.yaw.hip) }
          : yaw,
    };
  }

  /** Body-space vector from `from` to `p`, forward gain applied. See normalization.ts for the convention. */
  private rel(p: Vec2, from: Vec2): BodyVec {
    const s = this.ref?.torso ?? this.baseline.bodyScale;
    return { lateral: -(p.x - from.x) / s, forward: ((p.y - from.y) / s) * this.cfg.forwardGain };
  }

  /** Body-space position relative to the reference center, true proportions (for trajectories). */
  private bodyRel(p: Vec2): BodyVec {
    const ref = this.ref!;
    return { lateral: -(p.x - ref.center.x) / ref.torso, forward: (p.y - ref.center.y) / ref.torso };
  }
}

const mag = (v: BodyVec) => Math.hypot(v.lateral, v.forward);
const yawDiff = (a: BodyYaw, b: BodyYaw): BodyYaw => ({
  shoulder: angleDelta(a.shoulder, b.shoulder),
  hip: angleDelta(a.hip, b.hip),
});
