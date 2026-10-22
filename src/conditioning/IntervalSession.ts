import { CONDITIONING_CONFIG } from '../config';
import type { ExerciseId } from './exercises';

export type IntervalPhase = 'ready' | 'work' | 'rest' | 'done';

export interface IntervalPlan {
  exercises: ExerciseId[];
  rounds: number;
  workSeconds: number;
  restSeconds: number;
  getReadySeconds: number;
}

export interface IntervalSegment {
  phase: IntervalPhase;
  /** Rest segments carry the round and block that come next. */
  round: number;
  index: number;
  exercise: ExerciseId;
  start: number;
  end: number;
}

export interface IntervalRep {
  round: number;
  index: number;
  exercise: ExerciseId;
  kind: 'rep' | 'partial';
  /** ms since the session started. */
  t: number;
}

export interface IntervalResult {
  plan: IntervalPlan;
  reps: IntervalRep[];
  /** Work time actually completed per round × block (ms): less than planned if ended early. */
  workMs: number[][];
  startTime: number;
  endTime: number;
  endedEarly: boolean;
}

export interface IntervalState {
  phase: IntervalPhase;
  round: number;
  index: number;
  /** Exercise of the current block, or of the next block during ready / rest. */
  exercise: ExerciseId;
  remainingMs: number;
  segmentMs: number;
  /** Segment changed since the previous tick. */
  changed: boolean;
}

export function makeIntervalPlan(exercises: ExerciseId[], rounds: number, cfg = CONDITIONING_CONFIG): IntervalPlan {
  return { exercises, rounds, workSeconds: cfg.workSeconds, restSeconds: cfg.restSeconds, getReadySeconds: cfg.getReadySeconds };
}

export const intervalTotalSeconds = (p: IntervalPlan) =>
  p.getReadySeconds + p.rounds * p.exercises.length * p.workSeconds + (p.rounds * p.exercises.length - 1) * p.restSeconds;

/** ready → work, rest, work, rest … work → done (no rest after the last block). */
export function buildIntervalSchedule(plan: IntervalPlan): IntervalSegment[] {
  const out: IntervalSegment[] = [];
  let t = 0;
  const push = (phase: IntervalPhase, round: number, index: number, seconds: number) => {
    out.push({ phase, round, index, exercise: plan.exercises[index], start: t, end: t + seconds * 1000 });
    t += seconds * 1000;
  };
  push('ready', 0, 0, plan.getReadySeconds);
  for (let r = 0; r < plan.rounds; r++) {
    plan.exercises.forEach((_, i) => {
      push('work', r, i, plan.workSeconds);
      const last = r === plan.rounds - 1 && i === plan.exercises.length - 1;
      if (!last) {
        const nextRound = i === plan.exercises.length - 1 ? r + 1 : r;
        const nextIndex = i === plan.exercises.length - 1 ? 0 : i + 1;
        push('rest', nextRound, nextIndex, plan.restSeconds);
      }
    });
  }
  return out;
}

/**
 * Runs a timed conditioning session: a real round clock that never pauses. Reps are attributed
 * to the block in progress; anything detected during rest is ignored. Pure logic; timestamps come
 * from the pose frames.
 */
export class IntervalSession {
  readonly schedule: IntervalSegment[];
  readonly reps: IntervalRep[] = [];
  private startTime = 0;
  private now = 0;
  private seg = 0;
  private ended: number | null = null;

  constructor(readonly plan: IntervalPlan) {
    this.schedule = buildIntervalSchedule(plan);
  }

  start(t: number) {
    this.startTime = t;
    this.now = t;
  }

  get current(): IntervalSegment {
    return this.schedule[Math.min(this.seg, this.schedule.length - 1)];
  }

  get done() {
    return this.ended !== null || this.now - this.startTime >= this.schedule[this.schedule.length - 1].end;
  }

  tick(t: number): IntervalState {
    this.now = t;
    const elapsed = t - this.startTime;
    const before = this.seg;
    while (this.seg < this.schedule.length && elapsed >= this.schedule[this.seg].end) this.seg++;
    const changed = this.seg !== before;
    const s = this.current;
    if (this.done) {
      return { phase: 'done', round: s.round, index: s.index, exercise: s.exercise, remainingMs: 0, segmentMs: 0, changed };
    }
    return { phase: s.phase, round: s.round, index: s.index, exercise: s.exercise, remainingMs: s.end - elapsed, segmentMs: s.end - s.start, changed };
  }

  /** Records a rep (or partial) against the block in progress; null outside work. */
  onRep(kind: 'rep' | 'partial', t: number): IntervalRep | null {
    const s = this.current;
    if (s.phase !== 'work' || this.done) return null;
    const rep: IntervalRep = { round: s.round, index: s.index, exercise: s.exercise, kind, t: t - this.startTime };
    this.reps.push(rep);
    return rep;
  }

  /** Finish now (the user ended early). */
  end(t: number) {
    this.now = t;
    this.ended ??= t;
  }

  result(): IntervalResult {
    const endAt = (this.ended ?? this.now) - this.startTime;
    const workMs = Array.from({ length: this.plan.rounds }, () => this.plan.exercises.map(() => 0));
    for (const s of this.schedule) {
      if (s.phase !== 'work') continue;
      workMs[s.round][s.index] = Math.max(0, Math.min(s.end, endAt) - s.start);
    }
    return {
      plan: this.plan,
      reps: this.reps,
      workMs,
      startTime: this.startTime,
      endTime: this.startTime + endAt,
      endedEarly: this.ended !== null && endAt < this.schedule[this.schedule.length - 1].end,
    };
  }
}
