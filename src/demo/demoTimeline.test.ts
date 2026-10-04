import { describe, expect, it } from 'vitest';
import { MOVEMENTS, STEP_MOVEMENTS, type MovementId } from '../movements';
import { buildTimeline, DEMO_CONFIG, fightingStance, sampleTimeline } from './demoTimeline';

const center = (p: { left: { x: number; z: number }; right: { x: number; z: number } }) => ({
  x: (p.left.x + p.right.x) / 2,
  z: (p.left.z + p.right.z) / 2,
});

describe('demo timeline uses the shared movement definitions', () => {
  it('each step moves the stance in the definition direction (same convention as the detector)', () => {
    for (const id of STEP_MOVEMENTS.map((m) => m.id)) {
      const [s] = buildTimeline([id], 'orthodox').steps;
      const a = center(s.from);
      const b = center(s.to);
      const d = MOVEMENTS[id].direction;
      expect(Math.sign(Math.round((b.x - a.x) * 100))).toBe(Math.sign(d.lateral));
      expect(Math.sign(Math.round((b.z - a.z) * 100))).toBe(Math.sign(d.forward));
    }
  });

  it('pivots rotate the body by the definition rotation and keep the lead foot planted', () => {
    const [s] = buildTimeline(['PIVOT_LEFT'], 'orthodox').steps;
    expect(s.to.yaw - s.from.yaw).toBe(MOVEMENTS.PIVOT_LEFT.rotation);
    expect(s.pivotFoot).toBe('left');
    expect(s.to.left.x).toBeCloseTo(s.from.left.x);
    expect(s.to.left.z).toBeCloseTo(s.from.left.z);
  });

  it('first foot follows the step rule (forward → lead, backward → rear, lateral → that side)', () => {
    const first = (id: MovementId) => buildTimeline([id], 'orthodox').steps[0].movingFoot;
    expect(first('FORWARD_STEP')).toBe('left');
    expect(first('BACKWARD_STEP')).toBe('right');
    expect(first('LEFT_STEP')).toBe('left');
    expect(first('RIGHT_STEP')).toBe('right');
  });

  it('chains movements: each starts from the previous end pose', () => {
    const tl = buildTimeline(['FORWARD_STEP', 'LEFT_STEP', 'PIVOT_RIGHT'], 'orthodox');
    expect(tl.steps[1].from).toEqual(tl.steps[0].to);
    expect(tl.steps[2].from).toEqual(tl.steps[1].to);
  });

  it('sampling is continuous and ends in the final pose', () => {
    const tl = buildTimeline(['FORWARD_STEP', 'RIGHT_STEP'], 'orthodox');
    expect(sampleTimeline(tl, 0, 'orthodox').phase).toBe('intro');
    expect(sampleTimeline(tl, DEMO_CONFIG.introMs + 100, 'orthodox')).toMatchObject({ index: 0, phase: 'move' });
    const end = sampleTimeline(tl, tl.totalMs + 1, 'orthodox');
    expect(end.phase).toBe('done');
    expect(end.pose).toEqual(tl.steps[1].to);
    // Mid-step the moving foot is lifted (not a teleport).
    const mid = sampleTimeline(tl, tl.steps[0].start + tl.steps[0].duration * 0.33, 'orthodox');
    expect(mid.pose.left.lift).toBeGreaterThan(0);
  });

  it('a dash travels twice as far as a step', () => {
    const dist = (id: MovementId) => {
      const [s] = buildTimeline([id], 'orthodox').steps;
      return Math.hypot(center(s.to).x - center(s.from).x, center(s.to).z - center(s.from).z);
    };
    expect(dist('DASH_FORWARD')).toBeCloseTo(2 * dist('FORWARD_STEP'));
  });

  it('orthodox stance: left foot forward, bladed to the right', () => {
    const s = fightingStance('orthodox');
    expect(s.left.z).toBeGreaterThan(s.right.z);
    expect(s.yaw).toBeLessThan(0);
  });
});
