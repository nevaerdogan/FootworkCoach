// Development only (?synthetic): feeds scripted poses through the real pipeline, so the whole
// flow (setup → stance → countdown → training / practice) can be exercised without a webcam.
import type { PoseFrame } from '../pose/types';
import { makeFrame } from '../test/fixtures';

const ASPECT = 16 / 9;
const TORSO = 0.25;
const HOLD_MS = 9000; // stand still: camera setup + stance calibration + countdown
const REST_MS = 900;

interface S {
  cx: number;
  fy: number;
  dl: number; // left ankle lateral offset from cx (image units, raw x)
  dr: number;
  ly: number; // ankle y offsets from fy
  ry: number;
  yaw: number;
  armL: number;
  armR: number;
}

const ease = (x: number) => {
  const c = Math.max(0, Math.min(1, x));
  return c * c * (3 - 2 * c);
};

function frameOf(s: S, t: number): PoseFrame {
  return makeFrame({
    t,
    cx: s.cx,
    feetY: s.fy,
    yaw: s.yaw,
    armExt: { left: s.armL, right: s.armR },
    override: {
      leftAnkle: { x: s.cx + s.dl, y: s.fy + s.ly },
      rightAnkle: { x: s.cx + s.dr, y: s.fy + s.ry },
    },
  });
}

type Seg = (p: number, s: S) => S;

/** Step-drag: lead (left) foot first, then the right foot follows. lateral: + = user's right. */
const step = (lateral: number, forward: number): Seg => (p, s) => {
  const dx = -(lateral * TORSO) / ASPECT;
  const dy = forward * TORSO;
  const a = ease(p / 0.55);
  const b = ease((p - 0.4) / 0.55);
  return { ...s, cx: s.cx + (dx * (a + b)) / 2, fy: s.fy + (dy * (a + b)) / 2, dl: s.dl + (dx * (a - b)) / 2, dr: s.dr - (dx * (a - b)) / 2, ly: s.ly + (dy * (a - b)) / 2, ry: s.ry - (dy * (a - b)) / 2 };
};
const pivot = (deg: number): Seg => (p, s) => ({ ...s, yaw: s.yaw + deg * ease(p) });
/** Shuffle: the whole body bounces at ~2 Hz (feet and hips rise together). */
const bounce = (ms: number): Seg => (p, s) => {
  const t = p * ms;
  const up = Math.max(0, Math.sin((2 * Math.PI * 2 * t) / 1000)) * 0.012;
  return { ...s, fy: s.fy - up };
};
const punch = (arm: 'left' | 'right', turn: number): Seg => (p, s) => {
  const e = Math.sin(Math.PI * Math.max(0, Math.min(1, p)));
  return { ...s, yaw: s.yaw + turn * e, armL: arm === 'left' ? e : 0, armR: arm === 'right' ? e : 0 };
};

/** One loop that returns to the start: steps, punches, pivots. */
const SCRIPT: { seg: Seg; ms: number; label: string }[] = [
  { seg: step(0, 0.16), ms: 600, label: 'FORWARD_STEP' },
  { seg: punch('left', -6), ms: 380, label: 'JAB' },
  { seg: step(0, -0.16), ms: 600, label: 'BACKWARD_STEP' },
  { seg: punch('right', 35), ms: 420, label: 'CROSS' },
  { seg: step(0.3, 0), ms: 600, label: 'RIGHT_STEP' },
  { seg: step(-0.3, 0), ms: 600, label: 'LEFT_STEP' },
  { seg: pivot(45), ms: 550, label: 'PIVOT_LEFT' },
  { seg: pivot(-45), ms: 550, label: 'PIVOT_RIGHT' },
  { seg: bounce(4000), ms: 4000, label: 'BOUNCE' },
];

export function syntheticFrameAt(elapsed: number, now: number): PoseFrame {
  let s: S = { cx: 0.5, fy: 0.88, dl: 0.05 / ASPECT, dr: -0.05 / ASPECT, ly: 0, ry: 0, yaw: 0, armL: 0, armR: 0 };
  if (elapsed < HOLD_MS) return frameOf(s, now);
  const cycle = SCRIPT.reduce((sum, x) => sum + x.ms + REST_MS, 0);
  let t = (elapsed - HOLD_MS) % cycle;
  for (const { seg, ms } of SCRIPT) {
    if (t < ms + REST_MS) return frameOf(seg(Math.min(1, t / ms), s), now);
    s = seg(1, s);
    s.armL = 0;
    s.armR = 0;
    t -= ms + REST_MS;
  }
  return frameOf(s, now);
}

/** Calls onFrame at ~30 fps with performance.now() timestamps. Returns a stop function. */
export function startSyntheticFeed(onFrame: (f: PoseFrame) => void): () => void {
  const start = performance.now();
  const id = setInterval(() => {
    const now = performance.now();
    onFrame(syntheticFrameAt(now - start, now));
  }, 33);
  return () => clearInterval(id);
}
