import { TRAINING_CONFIG } from '../config';
import type { DetectedMovement } from '../footwork/FootworkDetector';
import type { MovementId } from '../movements';

export interface AttemptRecord {
  index: number;
  expected: MovementId;
  /** When this movement became the expected one (GO, or the end of the previous movement). */
  expectedStart: number;
  detected: DetectedMovement | null;
  /** Detected type matches the expected type with sufficient confidence. */
  correct: boolean;
  /** No movement detected inside the time window. */
  missed: boolean;
}

export interface SessionResult {
  combination: MovementId[];
  attempts: AttemptRecord[];
  startTime: number;
  endTime: number;
}

/**
 * Walks through a combination: each detected movement fills the current slot (right or
 * wrong) and advances, so the user always moves forward through the round. A slot with
 * no movement inside its window is marked missed. Time does not run while the feet are
 * not visible. Pure logic; timestamps come from the pose frames.
 */
export class TrainingSession {
  readonly attempts: AttemptRecord[] = [];
  private startTime = 0;
  private windowStart = 0;
  private pausedMs = 0;
  private lastTick: number | null = null;
  private endTime = 0;

  constructor(
    readonly combination: MovementId[],
    private cfg = TRAINING_CONFIG,
  ) {}

  start(t: number) {
    this.startTime = t;
    this.windowStart = t;
    this.lastTick = t;
  }

  get index() {
    return this.attempts.length;
  }

  get done() {
    return this.attempts.length >= this.combination.length;
  }

  get expected(): MovementId | null {
    return this.combination[this.index] ?? null;
  }

  onMovement(m: DetectedMovement): AttemptRecord | null {
    const expected = this.expected;
    if (!expected) return null;
    return this.record({
      expected,
      detected: m,
      correct: !m.unclear && m.type === expected,
      missed: false,
      next: m.endTime,
    });
  }

  /** Call every frame. Returns a missed attempt when the window runs out. */
  tick(t: number, feetVisible: boolean): AttemptRecord | null {
    if (this.lastTick !== null && !feetVisible) this.pausedMs += t - this.lastTick;
    this.lastTick = t;
    const expected = this.expected;
    if (!expected || t - this.windowStart - this.pausedMs < this.cfg.moveWindowMs) return null;
    return this.record({ expected, detected: null, correct: false, missed: true, next: t });
  }

  result(): SessionResult {
    return { combination: this.combination, attempts: this.attempts, startTime: this.startTime, endTime: this.endTime };
  }

  private record(a: { expected: MovementId; detected: DetectedMovement | null; correct: boolean; missed: boolean; next: number }) {
    const rec: AttemptRecord = {
      index: this.index,
      expected: a.expected,
      expectedStart: this.windowStart,
      detected: a.detected,
      correct: a.correct,
      missed: a.missed,
    };
    this.attempts.push(rec);
    this.windowStart = a.next;
    this.pausedMs = 0;
    if (this.done) this.endTime = a.next;
    return rec;
  }
}
