import { describe, expect, it } from 'vitest';
import type { DetectedMovement } from '../footwork/FootworkDetector';
import type { MovementId } from '../movements';
import { alignSequence, scoreSession, sizeScore, timingScore } from './scoring';
import { TrainingSession } from './TrainingSession';

function move(type: MovementId, start: number, opts: Partial<DetectedMovement> = {}): DetectedMovement {
  return {
    type,
    directionConfidence: 0.95,
    magnitudeScore: 1,
    confidence: 0.95,
    displacement: 0.5,
    vector: { lateral: 0, forward: 0.5 },
    startTime: start,
    endTime: start + 450,
    duration: 450,
    firstFoot: null,
    footOrder: 'unknown',
    rotation: type.startsWith('PIVOT') ? (type === 'PIVOT_LEFT' ? 45 : -45) : 0,
    unclear: false,
    path: [],
    ...opts,
  };
}

/** Run a round: each entry is a detected movement or null (missed). */
function play(combination: MovementId[], moves: (DetectedMovement | null)[]) {
  const s = new TrainingSession(combination, { moveWindowMs: 5000 } as never);
  s.start(0);
  let t = 0;
  for (const m of moves) {
    if (m) {
      s.onMovement(m);
      t = m.endTime;
    } else {
      t += 5001;
      s.tick(t, true);
    }
  }
  return scoreSession(s.result());
}

describe('score components', () => {
  it('size: full marks inside the good range, falling to 0', () => {
    expect(sizeScore(1)).toBe(1);
    expect(sizeScore(0.7)).toBe(1);
    expect(sizeScore(0.45)).toBeCloseTo(0.5);
    expect(sizeScore(0.1)).toBe(0);
    expect(sizeScore(3.5)).toBe(0);
  });

  it('timing: quick reaction and duration score 1, slow ones less', () => {
    expect(timingScore(400, 500)).toBe(1);
    expect(timingScore(2600, 500)).toBeLessThan(1);
    expect(timingScore(5000, 3000)).toBe(0);
  });

  it('alignment finds the longest in-order match', () => {
    expect(alignSequence(['FORWARD_STEP', 'LEFT_STEP', 'BACKWARD_STEP'], ['LEFT_STEP', 'BACKWARD_STEP'])).toEqual([
      [1, 0],
      [2, 1],
    ]);
  });
});

describe('scoreSession', () => {
  const combo: MovementId[] = ['FORWARD_STEP', 'LEFT_STEP', 'PIVOT_RIGHT', 'BACKWARD_STEP'];

  it('a clean round scores high, in order, with positive feedback', () => {
    const r = play(combo, [move('FORWARD_STEP', 300), move('LEFT_STEP', 1100), move('PIVOT_RIGHT', 1900), move('BACKWARD_STEP', 2700)]);
    expect(r.overall).toBeGreaterThanOrEqual(95);
    expect(r.sequenceCorrect).toBe(true);
    expect(r.movements.every((m) => m.status === 'correct')).toBe(true);
    expect(r.feedback.some((f) => f.text === 'You performed the sequence in the correct order.')).toBe(true);
    expect(r.feedback.every((f) => f.tone === 'positive')).toBe(true);
  });

  it('a wrong direction scores 0 for that move and is explained', () => {
    const r = play(combo, [move('FORWARD_STEP', 300), move('RIGHT_STEP', 1100), move('PIVOT_RIGHT', 1900), move('BACKWARD_STEP', 2700)]);
    expect(r.movements[1]).toMatchObject({ status: 'wrong', score: 0 });
    expect(r.feedback[0]).toEqual({ tone: 'issue', text: 'Expected Left Step, but Right Step was detected.' });
    expect(r.overall).toBeLessThan(80);
  });

  it('a missed move does not cascade: later moves still match, out of position', () => {
    // User skips FORWARD; their LEFT fills slot 0, PIVOT slot 1, BACKWARD slot 2.
    const r = play(combo, [move('LEFT_STEP', 300), move('PIVOT_RIGHT', 1100), move('BACKWARD_STEP', 1900), null]);
    expect(r.movements.map((m) => m.status)).toEqual(['missed', 'correct', 'correct', 'correct']);
    expect(r.movements[1].inPosition).toBe(false);
    expect(r.movements[1].components.sequence).toBe(0.5);
    expect(r.sequenceCorrect).toBe(false);
  });

  it('a small pivot is reported with the measured angle', () => {
    const r = play(combo, [move('FORWARD_STEP', 300), move('LEFT_STEP', 1100), move('PIVOT_RIGHT', 1900, { rotation: -27 }), move('BACKWARD_STEP', 2700)]);
    expect(r.movements[2].sizeRatio).toBeCloseTo(0.6);
    expect(r.feedback.map((f) => f.text)).toContain('Your pivot right rotation was smaller than expected (27° of 45°).');
  });

  it('a late start lowers timing and is reported', () => {
    const r = play(['FORWARD_STEP'], [move('FORWARD_STEP', 2500)]);
    expect(r.movements[0].components.timing).toBeLessThan(1);
    expect(r.feedback.map((f) => f.text)).toContain('You started the forward step late (2.5 s after the cue).');
  });

  it('wrong foot order is reported (orthodox: forward step leads with the left foot)', () => {
    const r = play(['FORWARD_STEP'], [move('FORWARD_STEP', 300, { firstFoot: 'right', footOrder: 'right-first' })]);
    expect(r.movements[0].footOrderOk).toBe(false);
    expect(r.feedback.map((f) => f.text)).toContain('On the forward step, move your left foot first.');
  });

  it('never praises a move as accurate when an issue was reported for it', () => {
    const r = play(['FORWARD_STEP'], [move('FORWARD_STEP', 300, { displacement: 0.32 })]);
    const texts = r.feedback.map((f) => f.text);
    expect(texts).toContain('Your forward step was shorter than expected.');
    expect(texts).not.toContain('Your forward step was accurate.');
  });

  it('after a stance switch the lead foot changes: forward step should start with the right foot', () => {
    const r = play(
      ['SWITCH_STANCE', 'FORWARD_STEP'],
      [move('SWITCH_STANCE', 300), move('FORWARD_STEP', 1100, { firstFoot: 'right', footOrder: 'right-first' })],
    );
    expect(r.movements[1].footOrderOk).toBe(true);
    expect(r.movements[0].sizeRatio).toBe(1); // an in-place switch has no size to fall short on
  });

  it('every score is the documented weighted formula', () => {
    const r = play(['LEFT_STEP'], [move('LEFT_STEP', 300, { directionConfidence: 0.8, displacement: 0.3 })]);
    const c = r.movements[0].components;
    expect(r.movements[0].score).toBe(Math.round(100 * (c.direction * 0.45 + c.displacement * 0.25 + c.sequence * 0.2 + c.timing * 0.1)));
  });
});
