import { describe, expect, it } from 'vitest';
import type { DetectedMovement } from '../footwork/FootworkDetector';
import type { MovementId } from '../movements';
import { rhythmConsistency, scoreWorkout } from './workoutScoring';
import { buildSchedule, WorkoutSession } from './WorkoutSession';
import { BLOCKS, totalSeconds, WORKOUTS, type Workout } from './workouts';

const mv = (type: MovementId, start: number): DetectedMovement => ({
  type,
  directionConfidence: 0.9,
  magnitudeScore: 1,
  confidence: 0.9,
  displacement: 0.5,
  vector: { lateral: 0, forward: 0 },
  startTime: start,
  endTime: start + 300,
  duration: 300,
  firstFoot: null,
  footOrder: 'unknown',
  rotation: 0,
  unclear: false,
  path: [],
});

const two: Workout = {
  id: 't',
  name: 'Test',
  focus: '',
  rounds: 2,
  restSeconds: 30,
  blocks: [BLOCKS.lateral, BLOCKS.inOut],
};

describe('workout schedule', () => {
  it('default programs are 1 min work / 30 s rest / 4 rounds', () => {
    const gz = WORKOUTS.find((w) => w.id === 'gz-beginner')!;
    expect(gz.rounds).toBe(4);
    expect(gz.restSeconds).toBe(30);
    expect(gz.blocks.every((b) => b.seconds === 60)).toBe(true);
  });

  it('builds ready → work, switch, work → rest → … with no rest after the last round', () => {
    const s = buildSchedule(two);
    expect(s.map((x) => x.phase)).toEqual(['ready', 'work', 'switch', 'work', 'rest', 'work', 'switch', 'work']);
    expect(s[s.length - 1].end).toBe(3000 + totalSeconds(two) * 1000);
  });
});

describe('WorkoutSession', () => {
  it('walks the phases with the clock and resets the pattern at each block', () => {
    const w = new WorkoutSession(two);
    w.start(0);
    expect(w.tick(1000).phase).toBe('ready');
    expect(w.expected).toBeNull();
    const work = w.tick(3500);
    expect(work).toMatchObject({ phase: 'work', round: 0, block: 0, changed: true });
    expect(w.expected).toBe('LEFT_STEP');
    w.onMovement(mv('LEFT_STEP', 4000));
    expect(w.expected).toBe('RIGHT_STEP');
    expect(w.tick(63500).phase).toBe('switch');
    expect(w.tick(68500)).toMatchObject({ phase: 'work', block: 1 });
    expect(w.expected).toBe('FORWARD_STEP');
  });

  it('counts reps only during work; a wrong move still advances the pattern', () => {
    const w = new WorkoutSession(two);
    w.start(0);
    w.tick(1000);
    expect(w.onMovement(mv('LEFT_STEP', 1000))).toBeNull(); // during get-ready
    w.tick(4000);
    const r = w.onMovement(mv('FORWARD_STEP', 4000))!;
    expect(r).toMatchObject({ expected: 'LEFT_STEP', correct: false });
    expect(w.expected).toBe('RIGHT_STEP');
  });

  it('ending early records only the work time actually done', () => {
    const w = new WorkoutSession(two);
    w.start(0);
    w.tick(33000); // 30 s into round 1, block 1
    w.end(33000);
    const res = w.result();
    expect(res.endedEarly).toBe(true);
    expect(res.workMs[0][0]).toBe(30000);
    expect(res.workMs[0][1]).toBe(0);
    expect(w.done).toBe(true);
  });
});

describe('rhythm (shuffle) blocks', () => {
  const bounce = (t: number, clear = true): DetectedMovement => ({ ...mv('BOUNCE', t), magnitudeScore: clear ? 1 : 0.6 });
  const shuffle: Workout = { id: 's', name: 'S', focus: '', rounds: 1, restSeconds: 30, blocks: [BLOCKS.shuffleStraight] };

  it('bounces are reps (clear = correct) and never move the punch cue', () => {
    const w = new WorkoutSession(shuffle);
    w.start(0);
    w.tick(4000);
    expect(w.expected).toBe('JAB');
    w.onMovement(bounce(4000));
    w.onMovement(bounce(4500, false));
    expect(w.expected).toBe('JAB');
    w.onMovement(mv('JAB', 4800));
    expect(w.expected).toBe('CROSS');
    expect(w.reps.map((r) => [r.expected, r.correct])).toEqual([
      ['BOUNCE', true],
      ['BOUNCE', false],
      ['JAB', true],
    ]);
  });

  it('bounces outside a rhythm block are ignored', () => {
    const w = new WorkoutSession(two);
    w.start(0);
    w.tick(4000);
    expect(w.onMovement(bounce(4000))).toBeNull();
  });

  it('rhythm consistency in a shuffle block comes from the bounces alone', () => {
    const w = new WorkoutSession(shuffle);
    w.start(0);
    for (let t = 3200; t < 62000; t += 500) {
      w.tick(t);
      w.onMovement(bounce(t));
      if (t % 4000 === 200) w.onMovement(mv('JAB', t + 137)); // off-beat punches
    }
    w.tick(10 ** 9);
    expect(scoreWorkout(w.result()).components.rhythm).toBeGreaterThan(0.95);
  });
});

describe('workout scoring', () => {
  it('rhythm: a steady beat is ~1, an uneven one lower', () => {
    expect(rhythmConsistency([0, 1000, 2000, 3000, 4000])).toBeCloseTo(1);
    expect(rhythmConsistency([0, 400, 2000, 2300, 4500])).toBeLessThan(0.6);
  });

  function play(tempoPerMin: (round: number) => number, accuracy = 1) {
    const w = new WorkoutSession(two);
    w.start(0);
    for (const seg of w.schedule) {
      if (seg.phase !== 'work') continue;
      const gap = 60000 / tempoPerMin(seg.round);
      let i = 0;
      for (let t = seg.start + 200; t < seg.end - 300; t += gap, i++) {
        w.tick(t);
        const exp = w.expected!;
        w.onMovement(mv(i % Math.round(1 / (1 - accuracy + 1e-9)) === 0 && accuracy < 1 ? 'PIVOT_LEFT' : exp, t));
      }
    }
    w.tick(10 ** 9);
    return scoreWorkout(w.result());
  }

  it('a steady, accurate session at target pace scores high', () => {
    const s = play(() => 40);
    expect(s.components.accuracy).toBe(1);
    expect(s.components.rhythm).toBeGreaterThan(0.95);
    expect(s.overall).toBeGreaterThanOrEqual(95);
    expect(s.rounds).toHaveLength(2);
  });

  it('reports fatigue when the tempo drops between rounds', () => {
    const s = play((r) => (r === 0 ? 40 : 28));
    expect(s.feedback.map((f) => f.text).join(' ')).toMatch(/tempo dropped \d+% from round 1 to round 2/);
  });

  it('the score is the documented weighted formula', () => {
    const s = play(() => 30, 0.75);
    const c = s.components;
    expect(s.overall).toBe(Math.round(100 * (c.accuracy * 0.6 + c.rhythm * 0.25 + c.volume * 0.15)));
  });
});
