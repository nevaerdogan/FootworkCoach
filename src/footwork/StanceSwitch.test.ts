import { describe, expect, it } from 'vitest';
import { buildTimeline } from '../demo/demoTimeline';
import type { PoseFrame } from '../pose/types';
import { makeFrame } from '../test/fixtures';
import { BaselineCollector } from './baseline';
import { MotionAnalyzer } from './MotionAnalyzer';

const ASPECT = 16 / 9;
const ease = (x: number) => {
  const c = Math.max(0, Math.min(1, x));
  return c * c * (3 - 2 * c);
};

/** A front-facing stance: the lead foot is closer to the camera, i.e. lower in the image. */
interface Stance {
  leftY: number;
  rightY: number;
  yaw: number;
}
const ORTHODOX: Stance = { leftY: 0.905, rightY: 0.855, yaw: -30 };
const SOUTHPAW: Stance = { leftY: 0.855, rightY: 0.905, yaw: 30 };

function frame(t: number, s: Stance): PoseFrame {
  const feetY = (s.leftY + s.rightY) / 2;
  return makeFrame({
    t,
    feetY,
    yaw: s.yaw,
    override: {
      leftAnkle: { x: (0.5 * ASPECT + 0.05) / ASPECT, y: s.leftY },
      rightAnkle: { x: (0.5 * ASPECT - 0.05) / ASPECT, y: s.rightY },
    },
  });
}

/** rest → move (a → b) → rest, with each foot on its own timing window. */
function move(a: Stance, b: Stance, opts: { leftWin?: [number, number]; rightWin?: [number, number]; start?: number } = {}) {
  const { leftWin = [0, 1], rightWin = [0, 1], start = 0 } = opts;
  const out: PoseFrame[] = [];
  for (let t = 0; t <= 500 + 450 + 600; t += 33) {
    const p = (t - 500) / 450;
    const pl = ease((p - leftWin[0]) / (leftWin[1] - leftWin[0]));
    const pr = ease((p - rightWin[0]) / (rightWin[1] - rightWin[0]));
    const k = ease(p);
    out.push(
      frame(start + t, {
        leftY: a.leftY + (b.leftY - a.leftY) * pl,
        rightY: a.rightY + (b.rightY - a.rightY) * pr,
        yaw: a.yaw + (b.yaw - a.yaw) * k,
      }),
    );
  }
  return out;
}

function detect(frames: PoseFrame[]) {
  const c = new BaselineCollector();
  let b = null;
  for (let t = 0; t <= 1600; t += 33) {
    const s = c.push(frame(t, ORTHODOX));
    if (s.phase === 'done') b = s.baseline;
  }
  const a = new MotionAnalyzer(b!);
  return frames.flatMap((f) => a.push(f).movements.map((m) => m.type));
}

const forward = (s: Stance, d: number): Stance => ({ ...s, leftY: s.leftY + d, rightY: s.rightY + d });

describe('stance switch detection', () => {
  it('a hop that swaps the feet front-to-back is SWITCH_STANCE (not a pivot, despite the 60° turn)', () => {
    expect(detect(move(ORTHODOX, SOUTHPAW))).toEqual(['SWITCH_STANCE']);
  });

  it('switching back is detected too', () => {
    const there = move(ORTHODOX, SOUTHPAW);
    const back = move(SOUTHPAW, ORTHODOX, { start: 1600 });
    expect(detect([...there, ...back])).toEqual(['SWITCH_STANCE', 'SWITCH_STANCE']);
  });

  it('rear foot stepping through to the front while travelling forward is SHIFT_FORWARD', () => {
    // Rear (right) foot first, passing the lead; the old lead settles behind.
    const frames = move(ORTHODOX, forward(SOUTHPAW, 0.04), { rightWin: [0, 0.7], leftWin: [0.4, 1] });
    expect(detect(frames)).toEqual(['SHIFT_FORWARD']);
  });

  it('a normal forward step keeps the stance: FORWARD_STEP, not a shift', () => {
    expect(detect(move(ORTHODOX, forward(ORTHODOX, 0.04), { leftWin: [0, 0.7], rightWin: [0.3, 1] }))).toEqual(['FORWARD_STEP']);
  });

  it('a pivot keeps the lead foot in front: still PIVOT_LEFT', () => {
    const pivoted: Stance = { leftY: 0.905, rightY: 0.87, yaw: 15 };
    expect(detect(move(ORTHODOX, pivoted))).toEqual(['PIVOT_LEFT']);
  });
});

describe('demo follows the stance through a switch', () => {
  it('after a switch the right foot leads; the next forward step starts with it', () => {
    const tl = buildTimeline(['SWITCH_STANCE', 'FORWARD_STEP'], 'orthodox');
    const [sw, fwd] = tl.steps;
    expect(sw.from.left.z).toBeGreaterThan(sw.from.right.z);
    expect(sw.to.right.z).toBeGreaterThan(sw.to.left.z);
    expect(fwd.movingFoot).toBe('right');
  });

  it('a shift travels forward and flips the stance; the rear foot moves first', () => {
    const [s] = buildTimeline(['SHIFT_FORWARD'], 'orthodox').steps;
    const c = (p: typeof s.from) => (p.left.z + p.right.z) / 2;
    expect(c(s.to)).toBeGreaterThan(c(s.from));
    expect(s.to.right.z).toBeGreaterThan(s.to.left.z);
    expect(s.movingFoot).toBe('right');
  });
});
