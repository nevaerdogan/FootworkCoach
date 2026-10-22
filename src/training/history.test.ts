import { describe, expect, it } from 'vitest';
import { sampleResult } from '../dev/sampleResult';
import { loadHistory, previousFor, saveRecord, toRecord } from './history';
import { scoreSession } from './scoring';

function memoryStore() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

describe('session history', () => {
  const result = sampleResult();
  const score = scoreSession(result);

  it('stores date, combination, scores and timings', () => {
    const r = toRecord(score, result, new Date('2026-10-04T10:00:00Z'));
    expect(r.date).toBe('2026-10-04T10:00:00.000Z');
    expect(r.combination).toEqual(result.combination);
    expect(r.overallScore).toBe(score.overall);
    expect(r.movementScores).toHaveLength(result.combination.length);
    expect(r.timings.reactionMs).toHaveLength(result.combination.length);
  });

  it('saves newest first and reads back', () => {
    const store = memoryStore();
    saveRecord({ ...toRecord(score, result), overallScore: 50 }, store);
    saveRecord({ ...toRecord(score, result), overallScore: 80 }, store);
    expect(loadHistory(store).map((r) => r.overallScore)).toEqual([80, 50]);
  });

  it('finds the previous session with the same combination', () => {
    const store = memoryStore();
    const history = saveRecord({ ...toRecord(score, result), overallScore: 61 }, store);
    expect(previousFor(result.combination, history)?.overallScore).toBe(61);
    expect(previousFor(['LEFT_STEP'], history)).toBeNull();
  });

  it('survives corrupt storage', () => {
    const store = memoryStore();
    store.setItem('footwork.sessions.v1', '{not json');
    expect(loadHistory(store)).toEqual([]);
  });
});

describe('conditioning history', () => {
  it('stores the rep total and finds the previous session with the same plan', async () => {
    const { previousConditioning, toConditioningRecord } = await import('./history');
    const store = memoryStore();
    saveRecord(toConditioningRecord('free:PUSH_UP', 'Push-ups · free', 18, 61000, new Date('2026-10-05T10:00:00Z')), store);
    const history = saveRecord(toConditioningRecord('free:PUSH_UP', 'Push-ups · free', 22, 58000), store);
    expect(history[0]).toMatchObject({ kind: 'conditioning', reps: 22, workoutName: 'Push-ups · free', combination: [] });
    expect(previousConditioning('free:PUSH_UP', history)?.reps).toBe(22);
    expect(previousConditioning('timed:PUSH_UP:3', history)).toBeNull();
  });

  it('never shows up as a previous footwork round', async () => {
    const { toConditioningRecord } = await import('./history');
    const history = [toConditioningRecord('free:SIT_UP', 'Sit-ups · free', 10, 30000)];
    expect(previousFor([], history)).toBeNull();
  });
});
