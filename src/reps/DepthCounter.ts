import { REP_CONFIG } from '../config';
import type { ExerciseId } from '../conditioning/exercises';
import type { PoseFrame } from '../pose/types';
import { joint, SidePicker, type Joint, type Side } from './geometry';
import { RepCounter, type RepCounterConfig, type RepEvent } from './RepCounter';
import type { ExerciseCounter, RepUpdate, Tracking } from './types';

export interface Measurement {
  /** 0 = rest position, 1 = full range. */
  depth: number;
  /** Why the body is not in the exercise position (counting is suspended), or null. */
  posture: string | null;
}

/**
 * Shared machinery for exercises measured by a joint angle from a side view: pick the side facing
 * the camera, require its landmarks, gate on posture, smooth the depth and feed the rep counter.
 */
export abstract class DepthCounter implements ExerciseCounter {
  abstract readonly id: ExerciseId;
  protected counter: RepCounter;
  private picker: SidePicker;
  private depth: number | null = null;
  private lostSince: number | null = null;
  private lastT = 0;

  constructor(
    rep: RepCounterConfig,
    joints: Joint[],
    private required: Joint[],
    protected cfg = REP_CONFIG,
  ) {
    this.counter = new RepCounter(rep);
    this.picker = new SidePicker(joints, cfg.sideSwitchMargin);
  }

  protected abstract measure(frame: PoseFrame, side: Side): Measurement;
  protected abstract hintFor(event: RepEvent): string | null;

  get active() {
    return this.counter.active;
  }

  push(frame: PoseFrame | null, now?: number): RepUpdate {
    const t = frame?.timestamp ?? now ?? this.lastT;
    this.lastT = t;
    if (!frame) return this.lost(t);
    const side = this.picker.pick(frame);
    if (this.required.some((j) => joint(frame, side, j).visibility < this.cfg.minVisibility)) return this.lost(t);
    this.lostSince = null;

    const m = this.measure(frame, side);
    if (m.posture) {
      this.counter.abort();
      this.depth = null;
      return this.update(0, 'posture', null, m.posture);
    }
    this.depth = this.depth === null ? m.depth : this.depth + this.cfg.alpha * (m.depth - this.depth);
    const event = this.counter.push(this.depth, t);
    return this.update(this.depth, 'ok', event, event ? this.hintFor(event) : null);
  }

  reset() {
    this.counter.reset();
    this.picker.reset();
    this.depth = null;
    this.lostSince = null;
  }

  private lost(t: number): RepUpdate {
    this.lostSince ??= t;
    if (t - this.lostSince > this.cfg.lostTimeoutMs) {
      // Can't trust a rep we lost sight of.
      this.counter.abort();
      this.depth = null;
    }
    return this.update(this.depth ?? 0, 'lost', null, null);
  }

  private update(progress: number, tracking: Tracking, event: RepEvent | null, hint: string | null): RepUpdate {
    return { reps: this.counter.reps, partials: this.counter.partials, progress, tracking, event, hint };
  }
}

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
