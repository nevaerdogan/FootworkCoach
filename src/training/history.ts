import type { MovementId } from '../movements';
import type { MovementStatus, SessionScore } from './scoring';
import type { SessionResult } from './TrainingSession';
import type { WorkoutScore } from './workoutScoring';
import { workoutMoves } from './workouts';
import type { WorkoutResult } from './WorkoutSession';

/** Local-only session history (no account, no server). Video is never stored. */
export interface SessionRecord {
  date: string;
  /** Set for timed workouts. */
  workoutId?: string;
  workoutName?: string;
  combination: MovementId[];
  overallScore: number;
  movementScores: { id: MovementId; score: number; status: MovementStatus }[];
  timings: { totalMs: number; reactionMs: (number | null)[]; durationMs: (number | null)[] };
}

const KEY = 'footwork.sessions.v1';
const MAX_RECORDS = 50;

type Store = Pick<Storage, 'getItem' | 'setItem'>;
const defaultStore = (): Store | null => (typeof localStorage === 'undefined' ? null : localStorage);

export function toRecord(score: SessionScore, result: SessionResult, date = new Date()): SessionRecord {
  return {
    date: date.toISOString(),
    combination: result.combination,
    overallScore: score.overall,
    movementScores: score.movements.map((m) => ({ id: m.expected, score: m.score, status: m.status })),
    timings: {
      totalMs: Math.round(score.totalTimeMs),
      reactionMs: score.movements.map((m) => (m.reactionMs === null ? null : Math.round(m.reactionMs))),
      durationMs: score.movements.map((m) => (m.durationMs === null ? null : Math.round(m.durationMs))),
    },
  };
}

export function toWorkoutRecord(score: WorkoutScore, result: WorkoutResult, date = new Date()): SessionRecord {
  return {
    date: date.toISOString(),
    workoutId: result.workout.id,
    workoutName: result.workout.name,
    combination: workoutMoves(result.workout),
    overallScore: score.overall,
    movementScores: [],
    timings: { totalMs: score.workSeconds * 1000, reactionMs: [], durationMs: [] },
  };
}

/** Most recent earlier run of the same workout. */
export function previousWorkout(id: string, history: SessionRecord[]): SessionRecord | null {
  return history.find((r) => r.workoutId === id) ?? null;
}

/** Newest first. Corrupt or missing data yields an empty history. */
export function loadHistory(store: Store | null = defaultStore()): SessionRecord[] {
  try {
    const raw = store?.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRecord(record: SessionRecord, store: Store | null = defaultStore()): SessionRecord[] {
  const next = [record, ...loadHistory(store)].slice(0, MAX_RECORDS);
  try {
    store?.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: history is a nice-to-have, never break training over it.
  }
  return next;
}

const sameCombo = (a: MovementId[], b: MovementId[]) => a.length === b.length && a.every((id, i) => id === b[i]);

/** Most recent earlier session with the same combination, for "vs last time". */
export function previousFor(combination: MovementId[], history: SessionRecord[]): SessionRecord | null {
  return history.find((r) => !r.workoutId && sameCombo(r.combination, combination)) ?? null;
}
