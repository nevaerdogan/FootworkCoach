import { CONDITIONING_CONFIG } from '../config';
import type { Feedback } from '../training/scoring';
import { rhythmConsistency } from '../training/workoutScoring';
import { EXERCISES, type ExerciseId } from './exercises';
import type { IntervalResult } from './IntervalSession';

export interface ExerciseTotals {
  id: ExerciseId;
  reps: number;
  partials: number;
  /** Counted reps per round, for the rounds that were actually worked (an early end leaves later rounds out). */
  perRound: number[];
  /** Reps per minute of work on this exercise. */
  pace: number;
}

export interface IntervalSummary {
  total: number;
  partials: number;
  byExercise: ExerciseTotals[];
  rounds: { round: number; reps: number }[];
  workSeconds: number;
  /** Reps per minute over all work time. */
  pace: number;
  feedback: Feedback[];
}

/** Free practice of one exercise. */
export interface FreeResult {
  exercise: ExerciseId;
  reps: number;
  partials: number;
  /** ms since the start, one per counted rep. */
  repTimes: number[];
  startTime: number;
  endTime: number;
}

/** What a conditioning session hands to the results screen. */
export type ConditioningResult = { mode: 'timed'; result: IntervalResult } | { mode: 'free'; result: FreeResult };

export interface FreeSummary {
  reps: number;
  partials: number;
  durationMs: number;
  /** Reps per minute from the first rep to the last (null below the minimum rep count). */
  pace: number | null;
  /** 0..1 evenness of the time between reps (null below the minimum rep count). */
  consistency: number | null;
  feedback: Feedback[];
}

const lower = (id: ExerciseId) => EXERCISES[id].label.toLowerCase();
const shallow = (id: ExerciseId) =>
  id === 'PUSH_UP' ? 'were too shallow to count. Go all the way down.' : 'did not come all the way up, so they did not count.';
const minutes = (ms: number) => ms / 60000;

export function summarizeInterval(r: IntervalResult): IntervalSummary {
  const { plan, reps, workMs } = r;
  const counted = reps.filter((x) => x.kind === 'rep');
  const byExercise: ExerciseTotals[] = plan.exercises.map((id, index) => {
    const mine = reps.filter((x) => x.index === index);
    const ms = workMs.reduce((s, row) => s + row[index], 0);
    const n = mine.filter((x) => x.kind === 'rep').length;
    return {
      id,
      reps: n,
      partials: mine.length - n,
      perRound: workMs.flatMap((row, round) => (row[index] > 0 ? [mine.filter((x) => x.round === round && x.kind === 'rep').length] : [])),
      pace: ms > 0 ? n / minutes(ms) : 0,
    };
  });
  const rounds = workMs
    .map((row, round) => ({ round, reps: counted.filter((x) => x.round === round).length, ms: row.reduce((s, x) => s + x, 0) }))
    .filter((x) => x.ms > 0)
    .map(({ round, reps }) => ({ round, reps }));
  const workTotalMs = workMs.flat().reduce((s, x) => s + x, 0);
  return {
    total: counted.length,
    partials: reps.length - counted.length,
    byExercise,
    rounds,
    workSeconds: Math.round(workTotalMs / 1000),
    pace: workTotalMs > 0 ? counted.length / minutes(workTotalMs) : 0,
    feedback: intervalFeedback(byExercise, r.endedEarly),
  };
}

/** Every line comes from measured data. */
function intervalFeedback(byExercise: ExerciseTotals[], endedEarly: boolean): Feedback[] {
  const issues: string[] = [];
  const positives: string[] = [];
  for (const e of byExercise) {
    const done = e.perRound;
    const first = done[0];
    const last = done[done.length - 1];
    if (done.length >= 2 && first >= 5) {
      const drop = (first - last) / first;
      if (drop >= 0.25) issues.push(`${EXERCISES[e.id].label} dropped from ${first} in round 1 to ${last} in round ${done.length}.`);
      else if (drop <= 0.05) positives.push(`You held your ${lower(e.id)} count through all ${done.length} rounds.`);
    }
    if (e.partials >= 3 && e.partials / (e.reps + e.partials) >= 0.2) {
      issues.push(`${e.partials} ${lower(e.id)} ${shallow(e.id)}`);
    }
    if (e.reps >= 10 && e.pace >= EXERCISES[e.id].typicalPerMin) {
      positives.push(`Strong pace on ${lower(e.id)}: ${Math.round(e.pace)} per minute.`);
    }
  }
  if (endedEarly) issues.push('Workout ended early. Counts cover the time you trained.');
  return [
    ...issues.slice(0, 3).map((text) => ({ tone: 'issue' as const, text })),
    ...positives.slice(0, 2).map((text) => ({ tone: 'positive' as const, text })),
  ];
}

export function summarizeFree(r: FreeResult, cfg = CONDITIONING_CONFIG): FreeSummary {
  const times = r.repTimes;
  const enough = times.length >= cfg.minRepsForStats;
  const span = enough ? times[times.length - 1] - times[0] : 0;
  const pace = enough && span > 0 ? (times.length - 1) / minutes(span) : null;
  const consistency = enough ? rhythmConsistency(times) : null;

  const issues: string[] = [];
  const positives: string[] = [];
  if (r.partials >= 3 && r.partials / (r.reps + r.partials) >= 0.2) issues.push(`${r.partials} ${lower(r.exercise)} ${shallow(r.exercise)}`);
  if (enough && times.length >= 8) {
    // Pace of the first half of the reps vs the second half.
    const mid = Math.floor(times.length / 2);
    const rate = (ts: number[]) => (ts.length - 1) / minutes(ts[ts.length - 1] - ts[0] || 1);
    const a = rate(times.slice(0, mid));
    const b = rate(times.slice(mid));
    if (a > 0 && (a - b) / a >= 0.25) issues.push(`You slowed down: ${Math.round(a)} per minute at the start, ${Math.round(b)} at the end.`);
    else if (a > 0 && Math.abs(a - b) / a <= 0.1) positives.push('You kept an even pace from start to finish.');
  }
  if (consistency !== null && times.length >= 6) {
    if (consistency < 0.5) issues.push(`Your rhythm was uneven (consistency ${Math.round(consistency * 100)}%). Aim for a steady beat.`);
    else if (consistency >= 0.75) positives.push(`Your rhythm was steady (consistency ${Math.round(consistency * 100)}%).`);
  }
  return {
    reps: r.reps,
    partials: r.partials,
    durationMs: r.endTime - r.startTime,
    pace,
    consistency,
    feedback: [
      ...issues.slice(0, 3).map((text) => ({ tone: 'issue' as const, text })),
      ...positives.slice(0, 2).map((text) => ({ tone: 'positive' as const, text })),
    ],
  };
}
