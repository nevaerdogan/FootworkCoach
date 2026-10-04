import { LANDMARK_INDEX, toPoseFrame } from '../pose/landmarks';
import type { LandmarkName, PoseFrame, WorldTorso } from '../pose/types';

type Pt = { x: number; y: number; visibility?: number };

/**
 * Synthetic standing pose in raw (unmirrored) normalized coords, facing the camera.
 * The user's LEFT side is at larger x. `scale` shrinks the body around (cx, feetY)
 * to simulate standing further from the camera.
 */
export function makeFrame(
  opts: {
    t?: number;
    scale?: number;
    cx?: number;
    feetY?: number;
    aspect?: number;
    /** Body yaw in degrees (+ = turned toward the user's left). Adds world landmarks when set. */
    yaw?: number;
    /** Separate hip yaw (defaults to `yaw`). */
    hipYaw?: number;
    /** Arm extension 0..1 per arm (adds world landmarks). */
    armExt?: { left?: number; right?: number };
    override?: Partial<Record<LandmarkName, Pt>>;
  } = {},
): PoseFrame {
  const { t = 0, scale = 1, cx = 0.5, feetY = 0.88, aspect = 16 / 9, yaw, hipYaw = yaw, override = {} } = opts;
  const cos = Math.cos(((yaw ?? 0) * Math.PI) / 180);
  // Offsets from (cx, feetY) at scale 1 (y up is negative). Torso = 0.25.
  const base: Partial<Record<LandmarkName, [number, number]>> = {
    nose: [0, -0.73],
    leftShoulder: [0.05, -0.58], rightShoulder: [-0.05, -0.58],
    leftElbow: [0.07, -0.45], rightElbow: [-0.07, -0.45],
    leftWrist: [0.06, -0.5], rightWrist: [-0.06, -0.5],
    leftHip: [0.035, -0.33], rightHip: [-0.035, -0.33],
    leftKnee: [0.045, -0.16], rightKnee: [-0.045, -0.16],
    leftAnkle: [0.05, 0], rightAnkle: [-0.05, 0],
    leftHeel: [0.05, 0.01], rightHeel: [-0.05, 0.01],
    leftFootIndex: [0.06, 0.02], rightFootIndex: [-0.06, 0.02],
  };
  const raw = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.95 }));
  for (const [name, [dx, dy]] of Object.entries(base) as [LandmarkName, [number, number]][]) {
    // Rotation foreshortens the torso's apparent width in the 2D image.
    const w = /Shoulder|Hip/.test(name) ? cos : 1;
    raw[LANDMARK_INDEX[name]] = { x: cx + (dx * w * scale) / aspect, y: feetY + dy * scale, z: 0, visibility: 0.95 };
  }
  for (const [name, p] of Object.entries(override) as [LandmarkName, Pt][]) {
    raw[LANDMARK_INDEX[name]] = { ...raw[LANDMARK_INDEX[name]], ...p };
  }
  const frame = toPoseFrame(raw, t, aspect);
  if (yaw !== undefined || opts.armExt) frame.world = worldTorso(yaw ?? 0, hipYaw ?? yaw ?? 0, opts.armExt);
  return frame;
}

/** Arm pose: 0 = guard (fists by the chin), 1 = fully extended toward the camera. */
export function worldTorso(yaw: number, hipYaw: number, armExt: { left?: number; right?: number } = {}): WorldTorso {
  const axis = (deg: number, halfWidth: number, y: number) => {
    const r = (deg * Math.PI) / 180;
    const dx = halfWidth * Math.cos(r);
    const dz = halfWidth * Math.sin(r);
    return [{ x: dx, y, z: dz }, { x: -dx, y, z: -dz }];
  };
  const [leftShoulder, rightShoulder] = axis(yaw, 0.18, -0.5);
  const [leftHip, rightHip] = axis(hipYaw, 0.12, 0);
  const lerp = (a: number, b: number, e: number) => a + (b - a) * e;
  const arm = (sh: { x: number; y: number; z: number }, e: number, inward: number) => ({
    // Guard: elbow down, wrist up by the chin. Extended: straight line toward the camera (−z).
    elbow: { x: sh.x, y: lerp(sh.y + 0.25, sh.y, e), z: lerp(sh.z - 0.05, sh.z - 0.27, e) },
    wrist: { x: lerp(sh.x + inward, sh.x, e), y: lerp(sh.y + 0.05, sh.y, e), z: lerp(sh.z - 0.25, sh.z - 0.55, e) },
  });
  const l = arm(leftShoulder, armExt.left ?? 0, -0.05);
  const r = arm(rightShoulder, armExt.right ?? 0, 0.05);
  return {
    leftShoulder,
    rightShoulder,
    leftHip,
    rightHip,
    leftElbow: l.elbow,
    rightElbow: r.elbow,
    leftWrist: l.wrist,
    rightWrist: r.wrist,
  };
}

/** Synthetic punch: guard → extend → retract with the given arm. */
export function punchFrames(opts: { arm: 'left' | 'right'; outMs?: number; peak?: number; restMs?: number; start?: number }): PoseFrame[] {
  const { arm, outMs = 360, peak = 1, restMs = 400, start = 0 } = opts;
  const out: PoseFrame[] = [];
  for (let t = 0; t <= restMs * 2 + outMs; t += 33) {
    const p = (t - restMs) / outMs;
    const e = p <= 0 || p >= 1 ? 0 : Math.sin(Math.PI * p) * peak;
    out.push(makeFrame({ t: start + t, armExt: { [arm]: e } }));
  }
  return out;
}

/**
 * Synthetic pivot: rest → body rotates from `fromYaw` to `toYaw` while the rear (right, orthodox)
 * foot swings by (`swingLateral`, `swingForward`) torso units → rest. Lead foot and hips stay put.
 */
export function pivotFrames(
  opts: { fromYaw?: number; toYaw: number; hipLag?: number; swingLateral?: number; swingForward?: number; moveMs?: number; restMs?: number; start?: number },
): PoseFrame[] {
  const { fromYaw = 0, toYaw, hipLag = 0, swingLateral = 0, swingForward = 0, moveMs = 500, restMs = 500, start = 0 } = opts;
  const aspect = 16 / 9;
  const out: PoseFrame[] = [];
  for (let t = 0; t <= restMs * 2 + moveMs; t += 33) {
    const p = ease((t - restMs) / moveMs);
    const yaw = fromYaw + (toYaw - fromYaw) * p;
    const hipYaw = fromYaw + (toYaw - fromYaw) * (p * (1 - hipLag));
    out.push(
      makeFrame({
        t: start + t,
        yaw,
        hipYaw,
        override: {
          rightAnkle: {
            x: (0.5 * aspect - 0.05 - swingLateral * 0.25 * p) / aspect,
            y: 0.88 + swingForward * 0.25 * p,
          },
        },
      }),
    );
  }
  return out;
}

/** A still stance sampled at ~30 fps for `ms` milliseconds. */
export function stillFrames(ms: number, opts: Parameters<typeof makeFrame>[0] = {}, start = 0) {
  const out: PoseFrame[] = [];
  for (let t = start; t <= start + ms; t += 33) out.push(makeFrame({ ...opts, t }));
  return out;
}

const ease = (x: number) => {
  const c = Math.max(0, Math.min(1, x));
  return c * c * (3 - 2 * c);
};

/**
 * Synthetic step: rest → feet move → rest. `lateral` (+ = user's right) and `forward`
 * (+ = toward camera) are in torso units of IMAGE displacement (before forward gain).
 * The `first` foot starts moving, the other follows `lagMs` later.
 */
export function stepFrames(
  opts: {
    lateral?: number;
    forward?: number;
    scaleTo?: number;
    moveMs?: number;
    restMs?: number;
    first?: 'left' | 'right';
    lagMs?: number;
    start?: number;
    noise?: (t: number) => number;
  } = {},
): PoseFrame[] {
  const { lateral = 0, forward = 0, scaleTo = 1, moveMs = 400, restMs = 500, first = 'left', lagMs = 120, start = 0 } = opts;
  const aspect = 16 / 9;
  const torso = 0.25;
  const out: PoseFrame[] = [];
  for (let t = 0; t <= restMs * 2 + moveMs; t += 33) {
    const prog = (lag: number) => ease((t - restMs - lag) / (moveMs - lagMs));
    const pL = prog(first === 'left' ? 0 : lagMs);
    const pR = prog(first === 'right' ? 0 : lagMs);
    const body = (pL + pR) / 2;
    const scale = 1 + (scaleTo - 1) * body;
    const n = opts.noise?.(t) ?? 0;
    const ankle = (side: 1 | -1, p: number) => ({
      x: (0.5 * aspect + 0.05 * scale * side - lateral * torso * p) / aspect + n,
      y: 0.88 + forward * torso * p + n,
    });
    out.push(
      makeFrame({
        t: start + t,
        scale,
        cx: 0.5 - (lateral * torso * body) / aspect,
        feetY: 0.88 + forward * torso * body,
        override: { leftAnkle: ankle(1, pL), rightAnkle: ankle(-1, pR) },
      }),
    );
  }
  return out;
}

/** Deterministic pseudo-random noise in [-amp, amp]. */
export function seededNoise(amp: number, seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return ((s / 2147483647) * 2 - 1) * amp;
  };
}
