import { WORKOUT_CONFIG } from '../config';
import type { DetectedMovement } from '../footwork/FootworkDetector';
import type { MovementId } from '../movements';
import type { Workout } from './workouts';

export type WorkoutPhase = 'ready' | 'work' | 'switch' | 'rest' | 'done';

export interface Segment {
  phase: WorkoutPhase;
  round: number;
  block: number;
  start: number;
  end: number;
}

export interface Rep {
  round: number;
  block: number;
  expected: MovementId;
  detected: DetectedMovement;
  correct: boolean;
  /** Movement start, ms since the workout started. */
  t: number;
}

export interface WorkoutResult {
  workout: Workout;
  reps: Rep[];
  /** Work time actually completed per round × block (ms) — less than planned if ended early. */
  workMs: number[][];
  startTime: number;
  endTime: number;
  endedEarly: boolean;
}

export interface WorkoutState {
  phase: WorkoutPhase;
  round: number;
  block: number;
  /** ms left in the current segment. */
  remainingMs: number;
  segmentMs: number;
  /** Phase or block changed since the previous tick. */
  changed: boolean;
}

/** get ready → (work [switch work…]) rest … → done. */
export function buildSchedule(w: Workout, cfg = WORKOUT_CONFIG): Segment[] {
  const out: Segment[] = [];
  let t = 0;
  const push = (phase: WorkoutPhase, round: number, block: number, ms: number) => {
    out.push({ phase, round, block, start: t, end: t + ms });
    t += ms;
  };
  push('ready', 0, 0, cfg.getReadySeconds * 1000);
  for (let r = 0; r < w.rounds; r++) {
    w.blocks.forEach((b, i) => {
      if (i > 0) push('switch', r, i, cfg.switchSeconds * 1000);
      push('work', r, i, b.seconds * 1000);
    });
    if (r < w.rounds - 1) push('rest', r + 1, 0, w.restSeconds * 1000);
  }
  return out;
}

/**
 * Runs a timed workout. Time never pauses (like a real round clock). During work, every detected
 * movement is a rep compared with the next move of the block's pattern; the pattern pointer always
 * advances, so one mistake doesn't derail the rest of the block. Movements outside work are ignored.
 */
export class WorkoutSession {
  readonly schedule: Segment[];
  readonly reps: Rep[] = [];
  private startTime = 0;
  private now = 0;
  private seg = 0;
  private pointer = 0;
  private ended: number | null = null;

  constructor(readonly workout: Workout) {
    this.schedule = buildSchedule(workout);
  }

  start(t: number) {
    this.startTime = t;
    this.now = t;
  }

  get current(): Segment {
    return this.schedule[Math.min(this.seg, this.schedule.length - 1)];
  }

  get done() {
    return this.ended !== null || this.now - this.startTime >= this.schedule[this.schedule.length - 1].end;
  }

  tick(t: number): WorkoutState {
    this.now = t;
    const elapsed = t - this.startTime;
    const before = this.seg;
    while (this.seg < this.schedule.length && elapsed >= this.schedule[this.seg].end) this.seg++;
    if (this.seg !== before && this.current.phase === 'work') this.pointer = 0;
    if (this.done) {
      return { phase: 'done', round: this.workout.rounds - 1, block: 0, remainingMs: 0, segmentMs: 0, changed: this.seg !== before };
    }
    const s = this.current;
    return {
      phase: s.phase,
      round: s.round,
      block: s.block,
      remainingMs: s.end - elapsed,
      segmentMs: s.end - s.start,
      changed: this.seg !== before,
    };
  }

  /** The move the user should do now (work only). */
  get expected(): MovementId | null {
    const s = this.current;
    if (s.phase !== 'work' || this.done) return null;
    const b = this.workout.blocks[s.block];
    if (!b.pattern.length) return b.rhythm ? 'BOUNCE' : null;
    return b.pattern[this.pointer % b.pattern.length];
  }

  /** The move after that, for a "next" preview. */
  get upcoming(): MovementId | null {
    const s = this.current;
    if (s.phase !== 'work' || this.done) return null;
    const p = this.workout.blocks[s.block].pattern;
    if (!p.length) return null;
    return p[(this.pointer + 1) % p.length];
  }

  onMovement(m: DetectedMovement): Rep | null {
    const s = this.current;
    if (s.phase !== 'work' || this.done) return null;
    const block = this.workout.blocks[s.block];
    if (m.type === 'BOUNCE') {
      // Rhythm: every bounce is a rep (clear bounces count as correct); the cue pointer stays.
      if (!block.rhythm) return null;
      const rep: Rep = { round: s.round, block: s.block, expected: 'BOUNCE', detected: m, correct: m.magnitudeScore >= 1, t: m.startTime - this.startTime };
      this.reps.push(rep);
      return rep;
    }
    if (!block.pattern.length) return null;
    const expected = this.expected;
    if (!expected) return null;
    const rep: Rep = {
      round: s.round,
      block: s.block,
      expected,
      detected: m,
      correct: !m.unclear && m.type === expected,
      t: m.startTime - this.startTime,
    };
    this.reps.push(rep);
    this.pointer++;
    return rep;
  }

  /** Finish now (user ended early). */
  end(t: number) {
    this.now = t;
    this.ended ??= t;
  }

  result(): WorkoutResult {
    const endAt = (this.ended ?? this.now) - this.startTime;
    const workMs = Array.from({ length: this.workout.rounds }, () => this.workout.blocks.map(() => 0));
    for (const s of this.schedule) {
      if (s.phase !== 'work') continue;
      workMs[s.round][s.block] = Math.max(0, Math.min(s.end, endAt) - s.start);
    }
    return {
      workout: this.workout,
      reps: this.reps,
      workMs,
      startTime: this.startTime,
      endTime: this.startTime + endAt,
      endedEarly: this.ended !== null && endAt < this.schedule[this.schedule.length - 1].end,
    };
  }
}
