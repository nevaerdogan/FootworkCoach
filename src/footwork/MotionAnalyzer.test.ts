import { describe, expect, it } from 'vitest';
import type { PoseFrame } from '../pose/types';
import { makeFrame, seededNoise, stillFrames } from '../test/fixtures';
import { BaselineCollector } from './baseline';
import { MotionAnalyzer } from './MotionAnalyzer';

function baseline() {
  const c = new BaselineCollector();
  for (const f of stillFrames(1600, { yaw: 0 })) {
    const s = c.push(f);
    if (s.phase === 'done') return s.baseline;
  }
  throw new Error('no baseline');
}

function run(frames: PoseFrame[]) {
  const a = new MotionAnalyzer(baseline());
  return frames.flatMap((f) => a.push(f).movements.map((m) => m.type));
}

const ease = (x: number) => {
  const c = Math.max(0, Math.min(1, x));
  return c * c * (3 - 2 * c);
};

/** Step-drag with a real pause: lead foot lands, the body waits, then the rear foot follows. */
function stepDrag(pauseMs: number, forward = 0.16): PoseFrame[] {
  const aspect = 16 / 9;
  const out: PoseFrame[] = [];
  const footMs = 220;
  for (let t = 0; t <= 500 + footMs * 2 + pauseMs + 600; t += 33) {
    const pL = ease((t - 500) / footMs);
    const pR = ease((t - 500 - footMs - pauseMs) / footMs);
    out.push(
      makeFrame({
        t,
        yaw: 0,
        feetY: 0.88 + forward * 0.25 * ((pL + pR) / 2),
        override: {
          leftAnkle: { x: (0.5 * aspect + 0.05) / aspect, y: 0.88 + forward * 0.25 * pL },
          rightAnkle: { x: (0.5 * aspect - 0.05) / aspect, y: 0.88 + forward * 0.25 * pR },
        },
      }),
    );
  }
  return out;
}

/** Punch with the torso turning into it (a cross rotates ~35°) and back. */
function punchWithTurn(arm: 'left' | 'right', turnDeg: number, guardTwitch = 0): PoseFrame[] {
  const out: PoseFrame[] = [];
  const other = arm === 'left' ? 'right' : 'left';
  for (let t = 0; t <= 400 + 380 + 700; t += 33) {
    const p = (t - 400) / 380;
    const e = p <= 0 || p >= 1 ? 0 : Math.sin(Math.PI * p);
    out.push(makeFrame({ t, yaw: turnDeg * e, armExt: { [arm]: e, [other]: guardTwitch * e } }));
  }
  return out;
}

describe('regressions from real-camera sessions', () => {
  it('one step-drag with a pause between the feet is ONE forward step, not two moves', () => {
    expect(run(stepDrag(250))).toEqual(['FORWARD_STEP']);
  });

  it('a cross that turns the torso is a CROSS, never a pivot', () => {
    expect(run(punchWithTurn('right', 38))).toEqual(['CROSS']);
  });

  it('a jab with a twitching guard hand is a JAB, not a cross', () => {
    expect(run(punchWithTurn('left', -8, 0.55))).toEqual(['JAB']);
  });

  it('jab then cross are told apart', () => {
    const jab = punchWithTurn('left', -6);
    const cross = punchWithTurn('right', 35).map((f) => ({ ...f, timestamp: f.timestamp + 2000 }));
    expect(run([...jab, ...cross])).toEqual(['JAB', 'CROSS']);
  });

  /**
   * Crosses were counted as jabs. In a bladed orthodox stance the rear wrist is
   * often hidden behind the body, while the torso turn moves the lead hand: the lead arm's own
   * signal looked bigger.
   */
  function crossHidden(opts: { turn: number; leadTwitch: number; rearVisibility: number }): PoseFrame[] {
    const out: PoseFrame[] = [];
    for (let t = 0; t <= 400 + 380 + 700; t += 33) {
      const p = (t - 400) / 380;
      const e = p <= 0 || p >= 1 ? 0 : Math.sin(Math.PI * p);
      const f = makeFrame({ t, yaw: opts.turn * e, armExt: { right: e, left: opts.leadTwitch * e } });
      out.push({ ...f, rightWrist: { ...f.rightWrist, visibility: opts.rearVisibility } });
    }
    return out;
  }

  it('a cross with the rear wrist hidden and the lead hand moving is still a CROSS (shoulder turn)', () => {
    expect(run(crossHidden({ turn: 35, leadTwitch: 0.45, rearVisibility: 0.15 }))).toEqual(['CROSS']);
  });

  it('a cross without much shoulder turn: the hand that travelled toward the camera decides', () => {
    expect(run(crossHidden({ turn: 4, leadTwitch: 0.45, rearVisibility: 0.15 }))).toEqual(['CROSS']);
  });

  it('a jab with a slight opposite turn stays a JAB', () => {
    expect(run(punchWithTurn('left', -8))).toEqual(['JAB']);
  });

  it('a pivot with arms shifting (but no punch) is still a PIVOT, not a step', () => {
    const noise = seededNoise(0.3, 11);
    const frames: PoseFrame[] = [];
    for (let t = 0; t <= 1600; t += 33) {
      const p = ease((t - 500) / 500);
      frames.push(
        makeFrame({
          t,
          yaw: 45 * p,
          armExt: { left: Math.abs(noise()), right: Math.abs(noise()) },
          // the rear (right) foot swings around the lead foot
          override: { rightAnkle: { x: (0.5 * (16 / 9) - 0.05 - 0.25 * 0.25 * p) / (16 / 9), y: 0.88 - 0.1 * 0.25 * p } },
        }),
      );
    }
    expect(run(frames)).toEqual(['PIVOT_LEFT']);
  });

  it('shuffling in place yields BOUNCE events only — no phantom steps', () => {
    const frames: PoseFrame[] = [];
    for (let t = 0; t <= 5600; t += 33) {
      const up = t < 600 ? 0 : Math.max(0, Math.sin((2 * Math.PI * 2 * (t - 600)) / 1000)) * 0.012;
      frames.push(makeFrame({ t, yaw: 0, feetY: 0.88 - up }));
    }
    const types = run(frames);
    expect(types.length).toBeGreaterThanOrEqual(9);
    expect(types.every((t) => t === 'BOUNCE')).toBe(true);
  });

  it('a real pivot is still detected when no arm is active', () => {
    const frames: PoseFrame[] = [];
    for (let t = 0; t <= 1600; t += 33) frames.push(makeFrame({ t, yaw: 45 * ease((t - 500) / 500) }));
    expect(run(frames)).toEqual(['PIVOT_LEFT']);
  });
});
