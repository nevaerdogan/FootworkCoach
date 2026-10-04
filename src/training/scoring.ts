import { SCORING_CONFIG, TRAINING_CONFIG } from '../config';
import type { DetectedMovement } from '../footwork/FootworkDetector';
import { firstFootSide, MOVEMENTS, stanceAt, type MovementId } from '../movements';
import type { AttemptRecord, SessionResult } from './TrainingSession';

export type MovementStatus = 'correct' | 'unclear' | 'wrong' | 'missed';

export interface ScoreComponents {
  direction: number;
  displacement: number;
  sequence: number;
  timing: number;
}

export interface MovementScore {
  index: number;
  expected: MovementId;
  detected: DetectedMovement | null;
  status: MovementStatus;
  /** Performed in its own slot (no shift from missed or wrong moves before it). */
  inPosition: boolean;
  components: ScoreComponents;
  /** 0–100. */
  score: number;
  reactionMs: number | null;
  durationMs: number | null;
  /** Measured size / expected size (displacement for steps, rotation for pivots). */
  sizeRatio: number | null;
  /** null when foot order is unknown or not applicable. */
  footOrderOk: boolean | null;
}

export interface Feedback {
  tone: 'issue' | 'positive';
  text: string;
}

export interface SessionScore {
  overall: number;
  movements: MovementScore[];
  /** Every move performed, each in its own position. */
  sequenceCorrect: boolean;
  /** Every move that was performed came in its own position (wrong or missed moves aside). */
  orderKept: boolean;
  totalTimeMs: number;
  feedback: Feedback[];
}

const C = SCORING_CONFIG;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const leadFootOf = () => (TRAINING_CONFIG.stance === 'orthodox' ? 'left' : 'right');

/** 1 inside the good range, falling linearly to 0 at the zero points. */
export function sizeScore(ratio: number): number {
  const [g0, g1] = C.sizeGood;
  const [z0, z1] = C.sizeZero;
  if (ratio < g0) return clamp01((ratio - z0) / (g0 - z0));
  if (ratio > g1) return clamp01(1 - (ratio - g1) / (z1 - g1));
  return 1;
}

export function timingScore(reactionMs: number, durationMs: number): number {
  const fall = (v: number, good: number, zero: number) => (v <= good ? 1 : clamp01(1 - (v - good) / (zero - good)));
  const r = fall(Math.max(0, reactionMs), C.reactionGoodMs, C.reactionZeroMs);
  const d = fall(durationMs, C.durationGoodMs, C.durationZeroMs);
  return r * C.reactionWeight + d * (1 - C.reactionWeight);
}

export function sizeRatioOf(m: DetectedMovement, expected: MovementId): number {
  const def = MOVEMENTS[expected];
  if (def.kind === 'pivot') return Math.abs(m.rotation) / Math.abs(def.rotation);
  // An in-place switch has no size to measure; a shift is measured by its forward travel.
  if (def.kind === 'switch') return def.detection.expectedDisplacement ? Math.max(0, m.vector.forward) / def.detection.expectedDisplacement : 1;
  return m.displacement / def.detection.expectedDisplacement;
}

/**
 * Longest common subsequence between expected and detected move types.
 * Returns [expectedIndex, detectionIndex] pairs, preferring the earliest matches.
 */
export function alignSequence(expected: MovementId[], detected: MovementId[]): [number, number][] {
  const n = expected.length;
  const m = detected.length;
  const dp = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = expected[i] === detected[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (expected[i] === detected[j] && dp[i][j] === dp[i + 1][j + 1] + 1) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

type Performed = AttemptRecord & { detected: DetectedMovement };

export function scoreSession(result: SessionResult): SessionScore {
  const { combination, attempts } = result;
  const leadFoot = leadFootOf();
  // Detections in the order they happened (missed slots carry no detection).
  const performed = attempts.filter((a): a is Performed => a.detected !== null);
  const pairs = alignSequence(
    combination,
    performed.map((a) => a.detected.type),
  );
  const matchOf = new Map(pairs.map(([i, j]) => [i, performed[j]]));
  const used = new Set<AttemptRecord>(pairs.map(([, j]) => performed[j]));

  const movements: MovementScore[] = combination.map((expected, index) => {
    const def = MOVEMENTS[expected];
    const att = matchOf.get(index);
    if (att) {
      const m = att.detected;
      const sizeRatio = sizeRatioOf(m, expected);
      const reactionMs = m.startTime - att.expectedStart;
      const inPosition = att.index === index;
      const components: ScoreComponents = {
        direction: m.directionConfidence,
        displacement: sizeScore(sizeRatio),
        sequence: inPosition ? 1 : C.outOfPositionCredit,
        timing: timingScore(reactionMs, m.duration),
      };
      // The lead foot changes after every switch or shift earlier in the round.
      const stance = stanceAt(combination, index, TRAINING_CONFIG.stance);
      const lead = stance === TRAINING_CONFIG.stance ? leadFoot : leadFoot === 'left' ? 'right' : 'left';
      const expectedFoot = def.kind === 'step' ? firstFootSide(def, lead) : null;
      return {
        index,
        expected,
        detected: m,
        status: m.unclear ? 'unclear' : 'correct',
        inPosition,
        components,
        score: weighted(components),
        reactionMs,
        durationMs: m.duration,
        sizeRatio,
        footOrderOk: expectedFoot && m.firstFoot ? m.firstFoot === expectedFoot : null,
      };
    }
    // Not performed: a different move was done in this slot, or nothing at all.
    const slot = attempts[index];
    const other = slot?.detected && !used.has(slot) ? slot.detected : null;
    return {
      index,
      expected,
      detected: other,
      status: other ? 'wrong' : 'missed',
      inPosition: false,
      components: { direction: 0, displacement: 0, sequence: 0, timing: 0 },
      score: 0,
      reactionMs: null,
      durationMs: null,
      sizeRatio: null,
      footOrderOk: null,
    };
  });

  const overall = movements.length ? Math.round(movements.reduce((s, m) => s + m.score, 0) / movements.length) : 0;
  const sequenceCorrect = movements.every((m) => m.inPosition);
  const orderKept = movements.every((m) => m.inPosition || m.status === 'wrong' || m.status === 'missed');
  return {
    overall,
    movements,
    sequenceCorrect,
    orderKept,
    totalTimeMs: result.endTime - result.startTime,
    feedback: buildFeedback(movements, sequenceCorrect),
  };
}

const weighted = (c: ScoreComponents) =>
  Math.round(
    100 *
      (c.direction * C.weights.direction +
        c.displacement * C.weights.displacement +
        c.sequence * C.weights.sequence +
        c.timing * C.weights.timing),
  );

const lower = (id: MovementId) => MOVEMENTS[id].label.toLowerCase();

/** Feedback comes only from measured data: one line per concrete finding. */
export function buildFeedback(movements: MovementScore[], sequenceCorrect: boolean): Feedback[] {
  const issues: { severity: number; text: string; index: number }[] = [];
  const positives: string[] = [];

  for (const m of movements) {
    const def = MOVEMENTS[m.expected];
    if (m.status === 'missed') {
      issues.push({ index: m.index, severity: 3, text: `No movement was detected for the ${lower(m.expected)}.` });
      continue;
    }
    if (m.status === 'wrong') {
      issues.push({ index: m.index, severity: 3, text: `Expected ${def.label}, but ${MOVEMENTS[m.detected!.type].label} was detected.` });
      continue;
    }
    if (m.status === 'unclear') {
      issues.push({ index: m.index, severity: 2, text: `Your ${lower(m.expected)} was unclear. Make it a more direct movement.` });
    }
    if (m.sizeRatio !== null && m.sizeRatio < C.feedbackSizeLow) {
      issues.push({
        index: m.index,
        severity: 2,
        text:
          def.kind === 'punch'
            ? `Your ${lower(m.expected)} did not reach full extension.`
            : def.kind === 'pivot'
            ? `Your ${lower(m.expected)} rotation was smaller than expected (${Math.round(Math.abs(m.detected!.rotation))}° of ${Math.abs(def.rotation)}°).`
            : `Your ${lower(m.expected)} was shorter than expected.`,
      });
    } else if (m.sizeRatio !== null && m.sizeRatio > C.feedbackSizeHigh) {
      issues.push({ index: m.index, severity: 1, text: `Your ${lower(m.expected)} was larger than expected.` });
    }
    if (m.reactionMs !== null && m.reactionMs > C.reactionGoodMs) {
      issues.push({
        index: m.index,
        severity: 1,
        text: `You started the ${lower(m.expected)} late (${(m.reactionMs / 1000).toFixed(1)} s after the cue).`,
      });
    }
    if (m.footOrderOk === false) {
      issues.push({ index: m.index, severity: 1, text: `On the ${lower(m.expected)}, move your ${firstFootSide(def, leadFootOf())} foot first.` });
    }
  }

  const allGood = (pred: (id: MovementId) => boolean) => {
    const group = movements.filter((m) => pred(m.expected));
    return group.length > 0 && group.every((m) => m.status === 'correct' && m.components.direction >= 0.7);
  };
  if (sequenceCorrect) positives.push('You performed the sequence in the correct order.');
  if (allGood((id) => MOVEMENTS[id].kind === 'step' && MOVEMENTS[id].direction.forward === 0)) {
    positives.push('Your lateral movement was detected correctly.');
  }
  if (allGood((id) => MOVEMENTS[id].kind === 'step' && MOVEMENTS[id].direction.lateral === 0)) {
    positives.push('Your forward and backward movement was detected correctly.');
  }
  if (allGood((id) => MOVEMENTS[id].kind === 'pivot')) positives.push('Your pivots turned in the right direction.');
  // Praise a move only if nothing was flagged for it (never "shorter than expected" AND "accurate").
  const flagged = new Set(issues.map((i) => i.index));
  for (const m of movements) {
    if (m.score >= C.feedbackStrongScore && !flagged.has(m.index)) positives.push(`Your ${lower(m.expected)} was accurate.`);
  }

  issues.sort((a, b) => b.severity - a.severity);
  return [
    ...issues.slice(0, C.maxIssues).map((i) => ({ tone: 'issue' as const, text: i.text })),
    ...[...new Set(positives)].slice(0, C.maxPositives).map((text) => ({ tone: 'positive' as const, text })),
  ];
}
