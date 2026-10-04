import { describe, expect, it } from 'vitest';
import type { DetectedMovement } from '../footwork/FootworkDetector';
import type { MovementId } from '../movements';
import { TrainingSession } from './TrainingSession';

const move = (type: MovementId, startTime: number, endTime: number, unclear = false): DetectedMovement => ({
  type,
  directionConfidence: 0.9,
  magnitudeScore: 0.9,
  confidence: 0.9,
  displacement: 0.4,
  vector: { lateral: 0, forward: 0.4 },
  startTime,
  endTime,
  duration: endTime - startTime,
  firstFoot: 'left',
  footOrder: 'left-first',
  rotation: 0,
  unclear,
  path: [],
});

const cfg = { moveWindowMs: 3000 } as never;

describe('TrainingSession', () => {
  it('records a correct sequence with expected start times', () => {
    const s = new TrainingSession(['FORWARD_STEP', 'LEFT_STEP'], cfg);
    s.start(1000);
    s.onMovement(move('FORWARD_STEP', 1400, 1800));
    expect(s.expected).toBe('LEFT_STEP');
    s.onMovement(move('LEFT_STEP', 2100, 2500));
    expect(s.done).toBe(true);
    expect(s.attempts.map((a) => a.correct)).toEqual([true, true]);
    expect(s.attempts[1].expectedStart).toBe(1800);
    expect(s.result().endTime).toBe(2500);
  });

  it('a wrong movement fills the slot and advances', () => {
    const s = new TrainingSession(['FORWARD_STEP', 'LEFT_STEP'], cfg);
    s.start(0);
    const a = s.onMovement(move('BACKWARD_STEP', 100, 500))!;
    expect(a.correct).toBe(false);
    expect(a.expected).toBe('FORWARD_STEP');
    expect(s.expected).toBe('LEFT_STEP');
  });

  it('an unclear detection never counts as correct', () => {
    const s = new TrainingSession(['FORWARD_STEP'], cfg);
    s.start(0);
    expect(s.onMovement(move('FORWARD_STEP', 100, 500, true))!.correct).toBe(false);
  });

  it('marks a movement missed when its window runs out', () => {
    const s = new TrainingSession(['FORWARD_STEP', 'LEFT_STEP'], cfg);
    s.start(0);
    expect(s.tick(2900, true)).toBeNull();
    const missed = s.tick(3001, true)!;
    expect(missed).toMatchObject({ expected: 'FORWARD_STEP', missed: true, correct: false });
    expect(s.expected).toBe('LEFT_STEP');
  });

  it('pauses the window while the feet are not visible', () => {
    const s = new TrainingSession(['FORWARD_STEP'], cfg);
    s.start(0);
    s.tick(1000, true);
    s.tick(3000, false); // 2 s hidden
    expect(s.tick(4000, true)).toBeNull();
    expect(s.tick(5100, true)).not.toBeNull();
  });

  it('ignores movements after the round is done', () => {
    const s = new TrainingSession(['FORWARD_STEP'], cfg);
    s.start(0);
    s.onMovement(move('FORWARD_STEP', 100, 500));
    expect(s.onMovement(move('LEFT_STEP', 900, 1300))).toBeNull();
    expect(s.attempts).toHaveLength(1);
  });
});
