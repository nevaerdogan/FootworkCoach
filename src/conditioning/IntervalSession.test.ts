import { describe, expect, it } from 'vitest';
import { buildIntervalSchedule, IntervalSession, intervalTotalSeconds, makeIntervalPlan } from './IntervalSession';
import { summarizeFree, summarizeInterval } from './summary';

const plan = makeIntervalPlan(['PUSH_UP', 'SIT_UP'], 2);

describe('interval schedule', () => {
  it('is 45 s work / 15 s rest with a 5 s get-ready and no rest after the last block', () => {
    const s = buildIntervalSchedule(plan);
    expect(s.map((x) => x.phase)).toEqual(['ready', 'work', 'rest', 'work', 'rest', 'work', 'rest', 'work']);
    expect(s[1].end - s[1].start).toBe(45000);
    expect(s[2].end - s[2].start).toBe(15000);
    expect(s[0].end).toBe(5000);
    expect(intervalTotalSeconds(plan)).toBe(5 + 4 * 45 + 3 * 15);
  });

  it('rest segments point at the block that comes next', () => {
    const s = buildIntervalSchedule(plan);
    expect(s[2]).toMatchObject({ phase: 'rest', round: 0, index: 1, exercise: 'SIT_UP' });
    expect(s[4]).toMatchObject({ phase: 'rest', round: 1, index: 0, exercise: 'PUSH_UP' });
  });
});

describe('IntervalSession', () => {
  it('walks the clock and attributes reps to the block in progress only', () => {
    const s = new IntervalSession(plan);
    s.start(1000);
    expect(s.tick(1000).phase).toBe('ready');
    expect(s.onRep('rep', 2000)).toBeNull(); // get ready: nothing counts
    const work = s.tick(1000 + 5000);
    expect(work).toMatchObject({ phase: 'work', round: 0, index: 0, exercise: 'PUSH_UP', changed: true });
    expect(work.remainingMs).toBe(45000);
    s.onRep('rep', 7000);
    s.onRep('partial', 8000);
    s.onRep('rep', 9000);
    expect(s.tick(1000 + 5000 + 45000).phase).toBe('rest');
    expect(s.onRep('rep', 52000)).toBeNull();
    s.tick(1000 + 5000 + 60000); // second block: sit-ups
    s.onRep('rep', 70000);
    s.tick(1000 + 5000 + 4 * 45000 + 3 * 15000);
    expect(s.done).toBe(true);
    const r = s.result();
    expect(r.reps.map((x) => [x.exercise, x.kind, x.round])).toEqual([
      ['PUSH_UP', 'rep', 0],
      ['PUSH_UP', 'partial', 0],
      ['PUSH_UP', 'rep', 0],
      ['SIT_UP', 'rep', 0],
    ]);
    expect(r.endedEarly).toBe(false);
    expect(r.workMs).toEqual([
      [45000, 45000],
      [45000, 45000],
    ]);
  });

  it('ending early keeps only the work time actually done', () => {
    const s = new IntervalSession(plan);
    s.start(0);
    s.tick(5000 + 20000); // 20 s into the first block
    s.onRep('rep', 10000);
    s.end(25000);
    const r = s.result();
    expect(r.endedEarly).toBe(true);
    expect(r.workMs).toEqual([
      [20000, 0],
      [0, 0],
    ]);
    expect(s.tick(26000).phase).toBe('done');
  });
});

describe('summaries', () => {
  it('interval: totals per exercise and round, pace, fatigue and partial feedback', () => {
    const s = new IntervalSession(plan);
    s.start(0);
    const block = (round: number, index: number) => 5000 + (round * 2 + index) * 60000;
    const doReps = (round: number, index: number, reps: number, partials = 0) => {
      s.tick(block(round, index) + 1);
      for (let i = 0; i < reps; i++) s.onRep('rep', block(round, index) + 1000 + i * 1000);
      for (let i = 0; i < partials; i++) s.onRep('partial', block(round, index) + 2000 + i * 1000);
    };
    doReps(0, 0, 20, 8); // push-ups r1, with 8 shallow attempts
    doReps(0, 1, 15); // sit-ups r1
    doReps(1, 0, 12); // push-ups r2: a big drop
    doReps(1, 1, 15); // sit-ups r2: steady
    s.tick(5000 + 4 * 45000 + 3 * 15000);
    const sum = summarizeInterval(s.result());
    expect(sum.total).toBe(62);
    expect(sum.partials).toBe(8);
    expect(sum.byExercise[0]).toMatchObject({ id: 'PUSH_UP', reps: 32, partials: 8, perRound: [20, 12] });
    expect(sum.byExercise[1]).toMatchObject({ id: 'SIT_UP', reps: 30, perRound: [15, 15] });
    expect(sum.rounds).toEqual([
      { round: 0, reps: 35 },
      { round: 1, reps: 27 },
    ]);
    expect(sum.workSeconds).toBe(180);
    expect(sum.pace).toBeCloseTo(62 / 3);
    const texts = sum.feedback.map((f) => f.text);
    expect(texts).toContain('Push-ups dropped from 20 in round 1 to 12 in round 2.');
    expect(texts).toContain('8 push-ups were too shallow to count. Go all the way down.');
    expect(texts).toContain('You held your sit-ups count through all 2 rounds.');
  });

  it('free: pace and consistency from the rep times, slowdown feedback', () => {
    const times = [0, 1000, 2000, 3000, 4000, 7000, 10000, 13000];
    const sum = summarizeFree({ exercise: 'PUSH_UP', reps: 8, partials: 0, repTimes: times, startTime: 0, endTime: 15000 });
    expect(sum.reps).toBe(8);
    expect(sum.durationMs).toBe(15000);
    expect(sum.pace).toBeCloseTo((7 / 13000) * 60000);
    expect(sum.consistency).not.toBeNull();
    expect(sum.feedback.map((f) => f.text)).toContain('You slowed down: 60 per minute at the start, 20 at the end.');
  });

  it('free: too few reps give no pace, and a steady set is praised', () => {
    const few = summarizeFree({ exercise: 'SIT_UP', reps: 2, partials: 0, repTimes: [0, 2000], startTime: 0, endTime: 3000 });
    expect(few.pace).toBeNull();
    expect(few.consistency).toBeNull();
    const steady = summarizeFree({
      exercise: 'JUMP_ROPE',
      reps: 10,
      partials: 0,
      repTimes: Array.from({ length: 10 }, (_, i) => i * 500),
      startTime: 0,
      endTime: 5000,
    });
    expect(steady.feedback.map((f) => f.tone)).toEqual(['positive', 'positive']);
  });
});
