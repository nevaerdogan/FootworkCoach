import { LANDMARK_INDEX, toPoseFrame } from '../pose/landmarks';
import type { LandmarkName, PoseFrame } from '../pose/types';
import { makeFrame } from './fixtures';

/**
 * Synthetic SIDE-VIEW poses for the rep counters. Coordinates are aspect-corrected image space
 * (X = x · aspect, y down); the athlete lies along the floor line y = FLOOR with the head to the
 * left and the feet to the right. The near side faces the camera; the far side sits slightly
 * behind it with low visibility, as MediaPipe reports in a real side view.
 */
const ASPECT = 16 / 9;
/** Torso length in image units (an adult ~2.5 m from a phone camera). */
const T = 0.22;
const FLOOR = 0.8;
const FRAME_MS = 33;

type XY = [number, number];
type Near = 'left' | 'right';

export interface SideOpts {
  /** Which side of the body faces the camera. */
  near?: Near;
  /** Visibility reported for the far-side joints. */
  farVisibility?: number;
}

function frameFrom(points: Partial<Record<LandmarkName, XY>>, t: number, opts: SideOpts = {}): PoseFrame {
  const { near = 'left', farVisibility = 0.45 } = opts;
  const raw = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0 }));
  const set = (name: LandmarkName, [X, y]: XY, visibility: number) => {
    raw[LANDMARK_INDEX[name]] = { x: X / ASPECT, y, z: 0, visibility };
  };
  for (const [name, p] of Object.entries(points) as [LandmarkName, XY][]) {
    if (!name.startsWith('left')) {
      set(name, p, 0.95);
      continue;
    }
    const mirror = ('right' + name.slice(4)) as LandmarkName;
    const [nearName, farName] = near === 'left' ? [name, mirror] : [mirror, name];
    set(nearName, p, 0.95);
    set(farName, [p[0] + 0.012, p[1] + 0.008], farVisibility);
  }
  return toPoseFrame(raw, t, ASPECT);
}

const lerp = (a: XY, b: XY, k: number): XY => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
const ease = (x: number) => {
  const c = Math.max(0, Math.min(1, x));
  return c * c * (3 - 2 * c);
};

/** Push-up position with the given elbow angle (180 = arms straight). `sag` drops the hips below the body line. */
export function pushUpFrame(t: number, elbowDeg: number, opts: SideOpts & { sag?: number } = {}): PoseFrame {
  const u = 0.13; // upper arm = forearm
  const half = (((180 - elbowDeg) / 2) * Math.PI) / 180;
  const wrist: XY = [0.5, FLOOR];
  const elbow: XY = [0.5 + u * Math.sin(half), FLOOR - u * Math.cos(half)];
  const shoulder: XY = [0.5, FLOOR - 2 * u * Math.cos(half)];
  const ankle: XY = [0.5 + 0.66, FLOOR - 0.02];
  const hip = lerp(shoulder, ankle, 0.34);
  hip[1] += opts.sag ?? 0;
  const knee = lerp(shoulder, ankle, 0.67);
  const nose: XY = [shoulder[0] - 0.07, shoulder[1] - 0.04];
  return frameFrom({ nose, leftShoulder: shoulder, leftElbow: elbow, leftWrist: wrist, leftHip: hip, leftKnee: knee, leftAnkle: ankle }, t, opts);
}

/** Lying on the back, knees bent, torso raised `torsoDeg` above the floor line. */
export function sitUpFrame(t: number, torsoDeg: number, opts: SideOpts = {}): PoseFrame {
  const hip: XY = [0.9, FLOOR - 0.04];
  const r = (torsoDeg * Math.PI) / 180;
  const shoulder: XY = [hip[0] - T * Math.cos(r), hip[1] - T * Math.sin(r)];
  const nose: XY = [shoulder[0] - 0.09 * Math.cos(r + 0.3), shoulder[1] - 0.09 * Math.sin(r + 0.3)];
  const elbow: XY = [shoulder[0] - 0.02 * Math.cos(r), shoulder[1] + 0.06];
  const wrist: XY = [shoulder[0] - 0.05, shoulder[1] - 0.04];
  const knee: XY = [hip[0] + 0.17, hip[1] - 0.15];
  const ankle: XY = [hip[0] + 0.32, FLOOR - 0.02];
  return frameFrom({ nose, leftShoulder: shoulder, leftElbow: elbow, leftWrist: wrist, leftHip: hip, leftKnee: knee, leftAnkle: ankle }, t, opts);
}

interface RepSeq {
  count?: number;
  /** One rep from rest to rest. */
  repMs?: number;
  /** Pause at rest between reps. */
  restMs?: number;
  start?: number;
}

/** Push-ups: arms straight → `bottom` → straight, `count` times. */
export function pushUpFrames(opts: RepSeq & SideOpts & { top?: number; bottom?: number; sag?: number } = {}): PoseFrame[] {
  const { count = 5, repMs = 1000, restMs = 400, start = 0, top = 170, bottom = 85 } = opts;
  const out: PoseFrame[] = [];
  const total = count * (repMs + restMs) + restMs;
  for (let t = 0; t <= total; t += FRAME_MS) {
    const inRep = (t - restMs) % (repMs + restMs);
    const p = t < restMs || inRep > repMs ? 0 : inRep / repMs;
    const angle = top - (top - bottom) * Math.sin(Math.PI * p);
    out.push(pushUpFrame(start + t, angle, opts));
  }
  return out;
}

/** Sit-ups: lying → `up` degrees → lying, `count` times. */
export function sitUpFrames(opts: RepSeq & SideOpts & { down?: number; up?: number } = {}): PoseFrame[] {
  const { count = 5, repMs = 1400, restMs = 400, start = 0, down = 5, up = 70 } = opts;
  const out: PoseFrame[] = [];
  const total = count * (repMs + restMs) + restMs;
  for (let t = 0; t <= total; t += FRAME_MS) {
    const inRep = (t - restMs) % (repMs + restMs);
    const p = t < restMs || inRep > repMs ? 0 : inRep / repMs;
    const torso = down + (up - down) * ease(p < 0.5 ? p * 2 : 2 - p * 2);
    out.push(sitUpFrame(start + t, torso, opts));
  }
  return out;
}

/** Torso length of the front-facing `makeFrame` figure, in image units. */
const FRONT_TORSO = 0.25;

/**
 * Jumping on the spot, facing the camera: the whole body (hips and feet) rises by `height` torso
 * lengths each jump. With `rebound`, a smaller hop follows every jump (the "double bounce" style).
 */
export function jumpFrames(
  opts: { count?: number; height?: number; flightMs?: number; groundMs?: number; rebound?: number; start?: number; scale?: number } = {},
): PoseFrame[] {
  const { count = 10, height = 0.12, flightMs = 300, groundMs = 200, rebound = 0, start = 0, scale = 1 } = opts;
  const out: PoseFrame[] = [];
  const hops = rebound > 0 ? [height, height * rebound] : [height];
  const cycle = hops.length * (flightMs + groundMs);
  const total = count * cycle + groundMs;
  for (let t = 0; t <= total; t += FRAME_MS) {
    const inCycle = t % cycle;
    const hop = Math.floor(inCycle / (flightMs + groundMs));
    const inHop = inCycle - hop * (flightMs + groundMs);
    const rise = t >= count * cycle || inHop > flightMs ? 0 : hops[hop] * Math.sin((Math.PI * inHop) / flightMs);
    out.push(makeFrame({ t: start + t, scale, feetY: 0.88 - rise * FRONT_TORSO * scale }));
  }
  return out;
}

/** Bending the knees on the spot: hips and shoulders dip by `depth` torso lengths, feet stay planted. */
export function bobFrames(opts: { count?: number; depth?: number; ms?: number; start?: number } = {}): PoseFrame[] {
  const { count = 10, depth = 0.12, ms = 500, start = 0 } = opts;
  const out: PoseFrame[] = [];
  for (let t = 0; t <= count * ms; t += FRAME_MS) {
    const dip = depth * FRONT_TORSO * Math.abs(Math.sin((Math.PI * t) / ms));
    const base = makeFrame({ t: start + t });
    const shift = (name: LandmarkName) => ({ x: base[name].x, y: base[name].y + dip });
    out.push(
      makeFrame({
        t: start + t,
        override: {
          nose: shift('nose'),
          leftShoulder: shift('leftShoulder'),
          rightShoulder: shift('rightShoulder'),
          leftHip: shift('leftHip'),
          rightHip: shift('rightHip'),
          leftKnee: shift('leftKnee'),
          rightKnee: shift('rightKnee'),
        },
      }),
    );
  }
  return out;
}

/** Standing still, facing the camera, for `ms`. */
export function standingFrames(ms: number, start = 0): PoseFrame[] {
  const out: PoseFrame[] = [];
  for (let t = 0; t <= ms; t += FRAME_MS) out.push(makeFrame({ t: start + t }));
  return out;
}
