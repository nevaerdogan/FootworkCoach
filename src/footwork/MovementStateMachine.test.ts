import { describe, expect, it } from 'vitest';
import { stepFrames, stillFrames } from '../test/fixtures';
import { BaselineCollector } from './baseline';
import { FootworkDetector } from './FootworkDetector';
import { MovementStateMachine, type MachineInput } from './MovementStateMachine';

const cfg = { confirmMs: 66, settleMs: 180, maxDurationMs: 2500, cooldownMs: 250 };

function run(m: MovementStateMachine, inputs: MachineInput[]) {
  return inputs.map((i) => m.step(i));
}

const frames = (from: number, to: number, active: boolean, planted: boolean) => {
  const out: MachineInput[] = [];
  for (let t = from; t < to; t += 33) out.push({ t, active, planted });
  return out;
};

describe('MovementStateMachine', () => {
  it('walks IDLE → STARTED → IN_PROGRESS → COMPLETED → RECOVERY → IDLE', () => {
    const m = new MovementStateMachine(cfg);
    const out = run(m, [
      ...frames(0, 100, false, true),
      ...frames(100, 500, true, false), // feet moving
      ...frames(500, 720, true, true), // planted at new position
      ...frames(720, 1200, false, true), // reference re-anchored after completion
    ]);
    const states = out.map((o) => o.state).filter((st, i, all) => st !== all[i - 1]);
    expect(states).toEqual(['IDLE', 'MOVEMENT_STARTED', 'MOVEMENT_IN_PROGRESS', 'MOVEMENT_COMPLETED', 'RECOVERY', 'IDLE']);
    const done = out.find((o) => o.event === 'COMPLETED')!;
    expect(done.endTime).toBeGreaterThanOrEqual(500);
    expect(done.endTime).toBeLessThan(540);
  });

  it('cancels a start that immediately drops back (noise spike)', () => {
    const m = new MovementStateMachine(cfg);
    const out = run(m, [{ t: 0, active: true, planted: true }, { t: 33, active: false, planted: true }]);
    expect(out.map((o) => o.event)).toEqual(['STARTED', 'CANCELLED']);
    expect(m.state).toBe('IDLE');
  });

  it('ignores new starts during the cooldown', () => {
    const m = new MovementStateMachine(cfg);
    run(m, [...frames(0, 300, true, false), ...frames(300, 520, true, true)]);
    expect(m.state).toBe('MOVEMENT_COMPLETED');
    const during = run(m, frames(520, 700, true, false));
    expect(during.every((o) => o.state === 'RECOVERY')).toBe(true);
    const after = run(m, frames(800, 900, true, false));
    expect(after.some((o) => o.event === 'STARTED')).toBe(true);
  });

  it('times out a movement that never settles', () => {
    const m = new MovementStateMachine(cfg);
    const out = run(m, frames(0, 3000, true, false));
    expect(out.filter((o) => o.event === 'TIMED_OUT')).toHaveLength(1);
  });

  it('does not complete while the feet are still moving', () => {
    const m = new MovementStateMachine(cfg);
    const out = run(m, frames(0, 1500, true, false));
    expect(out.some((o) => o.event === 'COMPLETED')).toBe(false);
  });
});

describe('detector + state machine', () => {
  it('exposes the state machine states while a step happens', () => {
    const c = new BaselineCollector();
    let b = null;
    for (const f of stillFrames(1600)) {
      const s = c.push(f);
      if (s.phase === 'done') b = s.baseline;
    }
    const d = new FootworkDetector(b!);
    const seen = new Set(stepFrames({ forward: 0.15, scaleTo: 1.08 }).map((f) => d.push(f).state));
    expect(seen).toContain('MOVEMENT_IN_PROGRESS');
    expect(seen).toContain('MOVEMENT_COMPLETED');
    expect(seen).toContain('RECOVERY');
  });
});
