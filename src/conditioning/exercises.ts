import type { IconName } from '../components/Icon';
import type { BodyPart } from '../pose/readiness';

/** Conditioning exercises counted by reps (push-ups, sit-ups, jump rope). */
export type ExerciseId = 'PUSH_UP' | 'SIT_UP' | 'JUMP_ROPE';

export interface ExerciseDefinition {
  id: ExerciseId;
  label: string;
  /** Compact label for HUDs and lists. */
  short: string;
  icon: IconName;
  /** Where the camera must be: beside the athlete (floor exercises) or in front (standing). */
  view: 'side' | 'front';
  /** Spoken name for voice cues. */
  voice: string;
  /** Reps are spoken aloud every N reps (jumps come too fast to say each one). */
  countEvery: number;
  /** Camera setup guidance, shown before the first block. */
  setup: { title: string; body: string };
  /** One line on how to get into position, spoken and shown before the block starts. */
  position: string;
  /** Body parts that must be in frame during camera setup (while standing at the spot). */
  parts: BodyPart[];
  /** Reference pace (reps per minute) for feedback lines. */
  typicalPerMin: number;
}

export const EXERCISES: Record<ExerciseId, ExerciseDefinition> = {
  PUSH_UP: {
    id: 'PUSH_UP',
    label: 'Push-ups',
    short: 'Push-ups',
    icon: 'pushup',
    view: 'side',
    voice: 'push-ups',
    countEvery: 1,
    setup: {
      title: 'Camera on the floor, side on',
      body: 'Lay the phone on its side on the floor, 2–3 m away, so it sees your whole body from the side. Then get into the push-up position.',
    },
    position: 'Get into the push-up position, side on to the camera.',
    parts: ['shoulders', 'hips', 'knees', 'ankles'],
    typicalPerMin: 30,
  },
  SIT_UP: {
    id: 'SIT_UP',
    label: 'Sit-ups',
    short: 'Sit-ups',
    icon: 'situp',
    view: 'side',
    voice: 'sit-ups',
    countEvery: 1,
    setup: {
      title: 'Camera on the floor, side on',
      body: 'Lay the phone on its side on the floor, 2–3 m away, so it sees your whole body from the side. Then lie on your back, knees bent.',
    },
    position: 'Lie on your back, knees bent, side on to the camera.',
    parts: ['shoulders', 'hips', 'knees', 'ankles'],
    typicalPerMin: 25,
  },
  JUMP_ROPE: {
    id: 'JUMP_ROPE',
    label: 'Jump rope',
    short: 'Rope',
    icon: 'rope',
    view: 'front',
    voice: 'jump rope',
    countEvery: 10,
    setup: {
      title: 'Camera in front, full body',
      body: 'Prop the phone up 2–3 m away, facing you, with your whole body from head to feet in the frame.',
    },
    position: 'Stand up and face the camera, feet in the frame.',
    parts: ['hips', 'knees', 'ankles'],
    typicalPerMin: 120,
  },
};

export const EXERCISE_LIST = Object.values(EXERCISES);

/** A conditioning session: timed intervals over one or more exercises, or free counting of one. */
export type ConditioningPlan =
  | { mode: 'timed'; exercises: ExerciseId[]; rounds: number }
  | { mode: 'free'; exercise: ExerciseId };

/** Stable key for history ("same plan as last time"). */
export function planKey(plan: ConditioningPlan): string {
  return plan.mode === 'timed' ? `timed:${plan.exercises.join('+')}:${plan.rounds}` : `free:${plan.exercise}`;
}

export function planName(plan: ConditioningPlan): string {
  if (plan.mode === 'free') return `${EXERCISES[plan.exercise].label} · free`;
  return plan.exercises.length === 1
    ? `${EXERCISES[plan.exercises[0]].label} · ${plan.rounds} × timed`
    : `Circuit · ${plan.exercises.map((id) => EXERCISES[id].short).join(', ')}`;
}
