/**
 * Animation model for the footwork demo. Consumes the SAME MovementDefinitions as the
 * detector, so what the fighter shows is exactly what the camera expects.
 *
 * Demo world space (meters), seen from BEHIND the fighter, who faces the camera/screen:
 *   x  + = fighter's right (screen right)
 *   z  + = forward = toward the camera (into the screen)
 *   angles/yaw (deg) + = counter-clockwise seen from above = turning toward the fighter's left.
 * These match the detector's body-space convention (lateral, forward, rotation).
 */
import type { Stance } from '../config';
import { firstFootSide, MOVEMENTS, otherStance, punchArmSide, type MovementId } from '../movements';

export const DEMO_CONFIG = {
  stepLength: 0.35,
  introMs: 900,
  /** Hold the final stance after each movement before the next starts. */
  holdMs: 450,
  liftHeight: 0.07,
  /** Movement phases as fractions of the movement duration. */
  anticipationEnd: 0.12,
  firstFoot: [0.12, 0.55] as const,
  secondFoot: [0.42, 0.85] as const,
  /** Dash: explosive push, the rear foot follows almost immediately and both feet glide low. */
  dashFirstFoot: [0.1, 0.5] as const,
  dashSecondFoot: [0.22, 0.62] as const,
  dashLift: 0.35,
  /** Switch stance: a small hop, both feet travel together. */
  switchWindow: [0.15, 0.75] as const,
  switchLift: 2.2,
};

export type Side = 'left' | 'right';

export interface FootPose {
  x: number;
  z: number;
  /** Toe direction (deg), 0 = pointing forward (+z). */
  angle: number;
  lift: number;
}

export interface DemoPose {
  left: FootPose;
  right: FootPose;
  /** Body yaw (deg). Orthodox fighting stance is bladed: turned right. */
  yaw: number;
  /** Small vertical dip (m) used for anticipation. */
  bob: number;
  /** Arm extension per side: 0 = guard, 1 = fully extended punch. */
  punch: { left: number; right: number };
}

const GUARD = { left: 0, right: 0 };

export interface AnimationStep {
  movement: MovementId;
  start: number;
  duration: number;
  from: DemoPose;
  to: DemoPose;
  /** Foot that moves first (steps) or swings (pivots). */
  movingFoot: Side;
  /** Pivots: foot that stays planted. */
  pivotFoot: Side | null;
  /** Punches: arm that throws. */
  arm: Side | null;
}

export interface Timeline {
  steps: AnimationStep[];
  totalMs: number;
}

export function fightingStance(stance: Stance): DemoPose {
  const s = stance === 'orthodox' ? 1 : -1; // southpaw mirrors the stance
  return {
    left: { x: -0.1 * s, z: s > 0 ? 0.2 : -0.2, angle: s > 0 ? -10 : -40, lift: 0 },
    right: { x: 0.14 * s, z: s > 0 ? -0.2 : 0.2, angle: s > 0 ? -45 : 15, lift: 0 },
    yaw: -30 * s,
    bob: 0,
    punch: GUARD,
  };
}

/** Rotate (x, z) around (px, pz) by deg, counter-clockwise seen from above. */
export function rotateAround(x: number, z: number, px: number, pz: number, deg: number) {
  const r = (deg * Math.PI) / 180;
  const dx = x - px;
  const dz = z - pz;
  return { x: px + dx * Math.cos(r) - dz * Math.sin(r), z: pz + dx * Math.sin(r) + dz * Math.cos(r) };
}

function endPose(from: DemoPose, id: MovementId, leadFoot: Side, stance: Stance): DemoPose {
  const m = MOVEMENTS[id];
  if (m.kind === 'punch' || m.kind === 'rhythm') return from; // in place: same stance afterwards
  if (m.kind === 'switch') {
    // New stance, mirrored, centred where the old one was (a shift also travels forward).
    const next = fightingStance(otherStance(stance));
    const cx = (from.left.x + from.right.x) / 2;
    const cz = (from.left.z + from.right.z) / 2 + m.direction.forward * DEMO_CONFIG.stepLength * m.travel;
    const nx = (next.left.x + next.right.x) / 2;
    const nz = (next.left.z + next.right.z) / 2;
    const move = (f: FootPose): FootPose => ({ ...f, x: f.x - nx + cx, z: f.z - nz + cz });
    return { ...next, left: move(next.left), right: move(next.right) };
  }
  if (m.kind === 'step') {
    const dx = m.direction.lateral * DEMO_CONFIG.stepLength * m.travel;
    const dz = m.direction.forward * DEMO_CONFIG.stepLength * m.travel;
    return {
      ...from,
      left: { ...from.left, x: from.left.x + dx, z: from.left.z + dz },
      right: { ...from.right, x: from.right.x + dx, z: from.right.z + dz },
    };
  }
  // Pivot: rotate the rear foot around the lead foot; body and both toes turn with it.
  const pivot = from[leadFoot];
  const rearSide: Side = leadFoot === 'left' ? 'right' : 'left';
  const rear = from[rearSide];
  const p = rotateAround(rear.x, rear.z, pivot.x, pivot.z, m.rotation);
  return {
    ...from,
    [leadFoot]: { ...pivot, angle: pivot.angle + m.rotation },
    [rearSide]: { ...rear, x: p.x, z: p.z, angle: rear.angle + m.rotation },
    yaw: from.yaw + m.rotation,
  } as DemoPose;
}

export function buildTimeline(combination: MovementId[], stance: Stance): Timeline {
  let current: Stance = stance;
  let leadFoot: Side = stance === 'orthodox' ? 'left' : 'right';
  let pose = fightingStance(stance);
  let t = DEMO_CONFIG.introMs;
  const steps: AnimationStep[] = combination.map((id) => {
    const m = MOVEMENTS[id];
    const to = endPose(pose, id, leadFoot, current);
    const step: AnimationStep = {
      movement: id,
      start: t,
      duration: m.animation.durationMs,
      from: pose,
      to,
      movingFoot: m.kind === 'pivot' ? (leadFoot === 'left' ? 'right' : 'left') : firstFootSide(m, leadFoot),
      pivotFoot: m.kind === 'pivot' ? leadFoot : null,
      arm: m.kind === 'punch' ? punchArmSide(m, leadFoot) : null,
    };
    pose = to;
    if (m.kind === 'switch') {
      current = otherStance(current);
      leadFoot = current === 'orthodox' ? 'left' : 'right';
    }
    t += m.animation.durationMs + DEMO_CONFIG.holdMs;
    return step;
  });
  return { steps, totalMs: t };
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const window01 = (p: number, [a, b]: readonly [number, number]) => clamp01((p - a) / (b - a));

function lerpFoot(a: FootPose, b: FootPose, q: number, liftScale = 1): FootPose {
  const e = easeInOut(q);
  return {
    x: a.x + (b.x - a.x) * e,
    z: a.z + (b.z - a.z) * e,
    angle: a.angle + (b.angle - a.angle) * e,
    lift: Math.sin(Math.PI * q) * DEMO_CONFIG.liftHeight * liftScale,
  };
}

/** Pose of one animation step at progress p (0..1). */
export function poseAt(step: AnimationStep, p: number): DemoPose {
  const { from, to } = step;
  const C = DEMO_CONFIG;
  const bob = p < C.anticipationEnd ? -Math.sin((Math.PI * p) / C.anticipationEnd) * 0.025 : 0;

  if (MOVEMENTS[step.movement].animation.style === 'bounce') {
    // Two light bounces on the balls of the feet, alternating which heel lifts more.
    const wave = Math.abs(Math.sin(2 * Math.PI * p));
    const first = p < 0.5;
    return {
      ...from,
      left: { ...from.left, lift: wave * (first ? 0.045 : 0.02) },
      right: { ...from.right, lift: wave * (first ? 0.02 : 0.045) },
      bob: wave * 0.04,
      punch: GUARD,
    };
  }

  if (step.arm) {
    // Snap out, brief hold at full reach, retract to guard. The cross turns the hips into it.
    const ext = p < 0.4 ? easeInOut(window01(p, [0.1, 0.4])) : p < 0.5 ? 1 : 1 - easeInOut(window01(p, [0.5, 0.85]));
    const turn = (step.arm === 'right' ? 1 : -1) * (MOVEMENTS[step.movement].arm === 'rear' ? 25 : 6);
    return { ...from, yaw: from.yaw + turn * ext, bob: 0, punch: { ...GUARD, [step.arm]: ext } };
  }

  if (step.pivotFoot) {
    const q = window01(p, [C.firstFoot[0], C.secondFoot[1]]);
    const e = easeInOut(q);
    const rot = (to.yaw - from.yaw) * e;
    const pivot = from[step.pivotFoot];
    const swing = from[step.movingFoot];
    const sp = rotateAround(swing.x, swing.z, pivot.x, pivot.z, rot);
    return {
      [step.pivotFoot]: { ...pivot, angle: pivot.angle + rot, lift: 0 },
      [step.movingFoot]: { x: sp.x, z: sp.z, angle: swing.angle + rot, lift: Math.sin(Math.PI * q) * C.liftHeight * 0.5 },
      yaw: from.yaw + rot,
      bob,
      punch: GUARD,
    } as unknown as DemoPose;
  }

  const second: Side = step.movingFoot === 'left' ? 'right' : 'left';
  const style = MOVEMENTS[step.movement].animation.style;
  const dash = style === 'dash';
  const hop = style === 'switch';
  const lift = dash ? C.dashLift : hop ? C.switchLift : 1;
  const w1 = dash ? C.dashFirstFoot : hop ? C.switchWindow : C.firstFoot;
  const w2 = dash ? C.dashSecondFoot : hop ? C.switchWindow : C.secondFoot;
  return {
    [step.movingFoot]: lerpFoot(from[step.movingFoot], to[step.movingFoot], window01(p, w1), lift),
    [second]: lerpFoot(from[second], to[second], window01(p, w2), lift),
    // The body turns into the new stance during a switch or shift (no-op for plain steps).
    yaw: from.yaw + (to.yaw - from.yaw) * easeInOut(window01(p, [C.firstFoot[0], C.secondFoot[1]])),
    bob,
    punch: GUARD,
  } as unknown as DemoPose;
}

export type DemoPhase = 'intro' | 'move' | 'hold' | 'done';

export interface DemoSample {
  pose: DemoPose;
  index: number;
  phase: DemoPhase;
  progress: number;
}

/** Sample the whole timeline at time t (ms since start). */
export function sampleTimeline(tl: Timeline, t: number, stance: Stance): DemoSample {
  if (tl.steps.length === 0 || t < tl.steps[0].start) {
    return { pose: tl.steps[0]?.from ?? fightingStance(stance), index: -1, phase: 'intro', progress: 0 };
  }
  for (let i = tl.steps.length - 1; i >= 0; i--) {
    const s = tl.steps[i];
    if (t >= s.start) {
      const p = (t - s.start) / s.duration;
      if (p < 1) return { pose: poseAt(s, p), index: i, phase: 'move', progress: p };
      const done = i === tl.steps.length - 1 && t >= tl.totalMs;
      return { pose: s.to, index: i, phase: done ? 'done' : 'hold', progress: 1 };
    }
  }
  return { pose: tl.steps[0].from, index: -1, phase: 'intro', progress: 0 };
}
