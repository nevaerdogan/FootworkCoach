import type { ExerciseId } from '../conditioning/exercises';
import type { PoseFrame } from '../pose/types';
import type { RepEvent } from './RepCounter';

/** ok: counting · lost: landmarks not visible · posture: the body is not in the exercise position. */
export type Tracking = 'ok' | 'lost' | 'posture';

export interface RepUpdate {
  reps: number;
  /** Attempts that did not go through the full range (reported, not counted). */
  partials: number;
  /** Live 0..1 position in the movement (0 = rest), for the gauge. */
  progress: number;
  tracking: Tracking;
  event: RepEvent | null;
  /** Short coaching line for the HUD; null when there is nothing to say. */
  hint: string | null;
}

export interface ExerciseCounter {
  readonly id: ExerciseId;
  /** `now` lets time advance while no pose is detected (null frames carry no timestamp). */
  push(frame: PoseFrame | null, now?: number): RepUpdate;
  reset(): void;
}
