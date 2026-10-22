import type { ExerciseId } from '../conditioning/exercises';
import { JumpCounter } from './JumpCounter';
import { PushUpCounter } from './PushUpCounter';
import { SitUpCounter } from './SitUpCounter';
import type { ExerciseCounter } from './types';

export type { ExerciseCounter, RepUpdate, Tracking } from './types';

/** The rep counter for an exercise. Each instance keeps its own totals; create one per block. */
export function createCounter(id: ExerciseId): ExerciseCounter {
  switch (id) {
    case 'PUSH_UP':
      return new PushUpCounter();
    case 'SIT_UP':
      return new SitUpCounter();
    case 'JUMP_ROPE':
      return new JumpCounter();
  }
}
