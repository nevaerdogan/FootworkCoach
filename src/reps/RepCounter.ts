export interface RepCounterConfig {
  /** Depth (0..1) that counts as the full range of motion. */
  enter: number;
  /** The rep completes when the depth falls back below this. */
  exit: number;
  /** Excursions that reach this but not `enter` are reported as partial reps (not counted). */
  partial: number;
  /** A complete rep can't be faster than this: anything quicker is tracking noise. */
  minRepMs: number;
  /** The full-range position must persist this long (rejects one-frame spikes). */
  minHoldMs: number;
}

export interface RepEvent {
  kind: 'rep' | 'partial';
  t: number;
  /** Running total of this kind, including this event. */
  count: number;
  /** Deepest point reached (0..1). */
  peak: number;
  /** From leaving rest to returning. */
  durationMs: number;
}

/**
 * Counts repetitions from a 0..1 depth signal with hysteresis, the way MediaPipe's repetition
 * counter works: a rep is entered above one threshold and counted only when the body is back
 * below a lower one, so hovering around a threshold never produces phantom reps. Pure logic;
 * feed it one smoothed value per frame.
 */
export class RepCounter {
  reps = 0;
  partials = 0;
  private out = false;
  private restAt: number | null = null;
  private startAt = 0;
  private peak = 0;
  private enteredAt: number | null = null;
  private lastEnterAt = 0;

  constructor(private cfg: RepCounterConfig) {}

  /** An excursion is in progress (the body has left the rest position). */
  get active() {
    return this.out;
  }

  push(depth: number, t: number): RepEvent | null {
    const C = this.cfg;
    if (!this.out) {
      if (depth < C.exit) this.restAt = t;
      if (depth >= C.partial) {
        this.out = true;
        this.startAt = this.restAt ?? t;
        this.peak = depth;
        this.enteredAt = depth >= C.enter ? t : null;
        this.lastEnterAt = t;
      }
      return null;
    }
    this.peak = Math.max(this.peak, depth);
    if (depth >= C.enter) {
      this.enteredAt ??= t;
      this.lastEnterAt = t;
    }
    if (depth > C.exit) return null;

    // Back at rest: judge the whole excursion.
    this.out = false;
    this.restAt = t;
    const durationMs = t - this.startAt;
    if (this.enteredAt !== null) {
      if (this.lastEnterAt - this.enteredAt >= C.minHoldMs && durationMs >= C.minRepMs) {
        this.reps++;
        return { kind: 'rep', t, count: this.reps, peak: this.peak, durationMs };
      }
      return null; // too brief to be a real rep
    }
    this.partials++;
    return { kind: 'partial', t, count: this.partials, peak: this.peak, durationMs };
  }

  /** Drop the excursion in progress (tracking lost, posture broken). Totals are kept. */
  abort() {
    this.out = false;
    this.enteredAt = null;
  }

  reset() {
    this.reps = 0;
    this.partials = 0;
    this.restAt = null;
    this.abort();
  }
}
