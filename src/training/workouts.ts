import { WORKOUT_CONFIG } from '../config';
import type { MovementId } from '../movements';

/**
 * Timed training: a workout is a number of rounds; each round runs its blocks back to back
 * (each block = one drill pattern repeated for a fixed time), then a rest.
 */
export interface WorkoutBlock {
  name: string;
  /** Repeated for the whole block, e.g. LEFT, RIGHT. May be empty for a pure rhythm block. */
  pattern: MovementId[];
  /** Shuffle block: bounces are counted continuously, alongside any cued moves. */
  rhythm?: boolean;
  seconds: number;
  /** Target pace (moves per minute) used for the volume score. */
  targetPerMin: number;
}

export interface Workout {
  id: string;
  name: string;
  focus: string;
  /** Where the drill comes from (credit). */
  source?: string;
  rounds: number;
  restSeconds: number;
  blocks: WorkoutBlock[];
}

const W = WORKOUT_CONFIG;

const block = (name: string, pattern: MovementId[], targetPerMin: number): WorkoutBlock => ({
  name,
  pattern,
  seconds: W.workSeconds,
  targetPerMin,
});

// Drill blocks transcribed from the reference videos (front-facing camera, orthodox stance).
export const BLOCKS = {
  lateral: block('Lateral Movement', ['LEFT_STEP', 'RIGHT_STEP'], 40),
  lateralShifts: block('Lateral Shifts', ['RIGHT_STEP', 'LEFT_STEP'], 48),
  sideToSide: block('Side to Side', ['LEFT_STEP', 'RIGHT_STEP', 'RIGHT_STEP', 'LEFT_STEP'], 36),
  inOut: block('In & Out', ['FORWARD_STEP', 'BACKWARD_STEP'], 40),
  stepInOutJab: block('Step In & Out + Jab', ['FORWARD_STEP', 'JAB', 'BACKWARD_STEP'], 36),
  lateralPunch: block('Lateral + Straight Punch', ['LEFT_STEP', 'JAB', 'RIGHT_STEP', 'CROSS'], 32),
  stanceSwitches: block('Stance Switches', ['SWITCH_STANCE'], 50),
  jumpShift: block('Jump + Shift', ['SWITCH_STANCE', 'SHIFT_FORWARD', 'BACKWARD_STEP'], 33),
  shuffle: { ...block('Shuffle', [], 110), rhythm: true },
  shuffleStraight: { ...block('Shuffle + Straight Punch', ['JAB', 'CROSS'], 120), rhythm: true },
  doubleShift: block('Double Shift', ['SHIFT_FORWARD', 'SHIFT_FORWARD', 'DASH_BACKWARD'], 30),
} satisfies Record<string, WorkoutBlock>;

const single = (id: string, b: WorkoutBlock, focus: string, source?: string): Workout => ({
  id,
  name: b.name,
  focus,
  source,
  rounds: W.rounds,
  restSeconds: W.restSeconds,
  blocks: [b],
});

export const WORKOUTS: Workout[] = [
  {
    id: 'gz-beginner',
    name: 'Beginner Footwork Program',
    focus: 'Lateral movement, step in & out with the jab, lateral shifts. One minute each, every round.',
    source: 'GZ — 3 effective beginners boxing footwork drills',
    rounds: W.rounds,
    restSeconds: W.restSeconds,
    blocks: [BLOCKS.lateral, BLOCKS.stepInOutJab, BLOCKS.lateralShifts],
  },
  {
    id: 'jassa-beginner',
    name: 'Boxing Footwork Circuit',
    focus: 'Shuffle, shuffle with straight punches, lateral, lateral with punches, side to side, in & out.',
    source: 'The Jassa — 6 Effective Boxing Footwork Drills For Beginners',
    rounds: W.rounds,
    restSeconds: W.restSeconds,
    blocks: [BLOCKS.shuffle, BLOCKS.shuffleStraight, BLOCKS.lateral, BLOCKS.lateralPunch, BLOCKS.sideToSide, BLOCKS.inOut],
  },
  {
    id: 'ji-switch-shift',
    name: 'Switch & Shift Program',
    focus: 'Stance switches, jump + shift, double shift. Light on your feet, one minute each.',
    source: 'Ji Martial Arts — 3 drills to improve your footwork',
    rounds: W.rounds,
    restSeconds: W.restSeconds,
    blocks: [BLOCKS.stanceSwitches, BLOCKS.jumpShift, BLOCKS.doubleShift],
  },
  single('shuffle', BLOCKS.shuffle, 'Stay light and bounce on the balls of your feet. Keep the beat even.', 'The Jassa'),
  single('stance-switches', BLOCKS.stanceSwitches, 'Hop and swap your stance on the spot, on a steady rhythm.', 'Ji Martial Arts'),
  single('lateral', BLOCKS.lateral, 'Step left, step right around your center. Stay light and balanced.'),
  single('side-to-side', BLOCKS.sideToSide, 'Cross the center to each side and back. Wider, controlled steps.'),
  single('in-out', BLOCKS.inOut, 'Step into range and straight back out, on a steady rhythm.'),
  single('step-in-out-jab', BLOCKS.stepInOutJab, 'Step in, land the jab, step back out.'),
];

export const totalWorkSeconds = (w: Workout) => w.rounds * w.blocks.reduce((s, b) => s + b.seconds, 0);

export const totalSeconds = (w: Workout) =>
  totalWorkSeconds(w) +
  (w.rounds - 1) * w.restSeconds +
  w.rounds * (w.blocks.length - 1) * WORKOUT_CONFIG.switchSeconds;

/** All moves a workout uses (for detection candidates and the demo). */
export const workoutMoves = (w: Workout): MovementId[] =>
  w.blocks.flatMap((b) => (b.rhythm ? ['BOUNCE' as MovementId, ...b.pattern] : b.pattern));

/** Dev only: shrink every duration (e.g. ?fast) to test the full flow quickly. */
export function scaledWorkout(w: Workout, k: number): Workout {
  return {
    ...w,
    restSeconds: Math.max(3, Math.round(w.restSeconds * k)),
    blocks: w.blocks.map((b) => ({ ...b, seconds: Math.max(5, Math.round(b.seconds * k)) })),
  };
}
