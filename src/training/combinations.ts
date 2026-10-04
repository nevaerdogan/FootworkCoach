import { MOVEMENTS, type MovementId } from '../movements';

export type Level = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';

/** Hand-written templates. Used as-is for the default round of each level. */
export const PRESETS: Record<Level, MovementId[]> = {
  BEGINNER: ['FORWARD_STEP', 'BACKWARD_STEP', 'LEFT_STEP', 'RIGHT_STEP'],
  INTERMEDIATE: ['FORWARD_STEP', 'LEFT_STEP', 'BACKWARD_STEP', 'RIGHT_STEP', 'PIVOT_LEFT'],
  ADVANCED: ['FORWARD_STEP', 'JAB', 'LEFT_STEP', 'PIVOT_RIGHT', 'CROSS', 'BACKWARD_STEP'],
};

export interface Drill {
  id: string;
  name: string;
  category: 'footwork' | 'punches';
  /** One line on what the drill trains. */
  focus: string;
  moves: MovementId[];
}

/**
 * Common boxing / kickboxing drills, expressed with the shared movement ids.
 * Step-drag rule applies throughout (the foot nearest the direction moves first).
 * Note: "diamond step" has no single standard definition; here it is the geometric
 * diamond traced with four diagonal steps, plus a Compass variant (out to each point and back).
 */
export const DRILLS: Drill[] = [
  {
    id: 'box',
    name: 'Box Step',
    category: 'footwork',
    focus: 'Forward, right, back, left: trace a square and finish where you started.',
    moves: ['FORWARD_STEP', 'RIGHT_STEP', 'BACKWARD_STEP', 'LEFT_STEP'],
  },
  {
    id: 'diamond',
    name: 'Diamond Step',
    category: 'footwork',
    focus: 'Four diagonal steps that trace a diamond and bring you back to the start.',
    moves: ['FORWARD_LEFT', 'FORWARD_RIGHT', 'BACKWARD_RIGHT', 'BACKWARD_LEFT'],
  },
  {
    id: 'compass',
    name: 'Compass',
    category: 'footwork',
    focus: 'Out to each point and back to center: front, side, back, other side.',
    moves: ['FORWARD_STEP', 'BACKWARD_STEP', 'RIGHT_STEP', 'LEFT_STEP', 'BACKWARD_STEP', 'FORWARD_STEP', 'LEFT_STEP', 'RIGHT_STEP'],
  },
  {
    id: 'in-out',
    name: 'In & Out',
    category: 'footwork',
    focus: 'Pendulum rhythm: step into range and straight back out.',
    moves: ['FORWARD_STEP', 'BACKWARD_STEP', 'FORWARD_STEP', 'BACKWARD_STEP'],
  },
  {
    id: 'l-step',
    name: 'L-Step',
    category: 'footwork',
    focus: 'Step back, step out to the side for a new angle, then angle back to center.',
    moves: ['BACKWARD_STEP', 'RIGHT_STEP', 'FORWARD_LEFT'],
  },
  {
    id: 'dash',
    name: 'Dash & Retreat',
    category: 'footwork',
    focus: 'Explode forward to close distance, then angle back out on both sides.',
    moves: ['DASH_FORWARD', 'BACKWARD_LEFT', 'BACKWARD_RIGHT'],
  },
  {
    id: 'stance-switch',
    name: 'Stance Switches',
    category: 'footwork',
    focus: 'Hop and swap your feet: orthodox to southpaw and back, staying light.',
    moves: ['SWITCH_STANCE', 'SWITCH_STANCE', 'SWITCH_STANCE', 'SWITCH_STANCE'],
  },
  {
    id: 'jump-shift',
    name: 'Jump + Shift',
    category: 'footwork',
    focus: 'Switch on the spot, shift forward through the stance, then step back to reset.',
    moves: ['SWITCH_STANCE', 'SHIFT_FORWARD', 'BACKWARD_STEP'],
  },
  {
    id: 'double-shift',
    name: 'Double Shift',
    category: 'footwork',
    focus: 'Two shifts in a row to cover distance, then dash back out to reset.',
    moves: ['SHIFT_FORWARD', 'SHIFT_FORWARD', 'DASH_BACKWARD'],
  },
  {
    id: 'pivot-out',
    name: 'Step & Pivot',
    category: 'footwork',
    focus: 'Step in, pivot off the line, step out, pivot back to square.',
    moves: ['FORWARD_STEP', 'PIVOT_LEFT', 'BACKWARD_STEP', 'PIVOT_RIGHT'],
  },
  {
    id: 'step-jab',
    name: 'Step & Jab',
    category: 'punches',
    focus: 'Step in and land the jab, reset, step out and jab again.',
    moves: ['FORWARD_STEP', 'JAB', 'BACKWARD_STEP', 'JAB'],
  },
  {
    id: 'one-two',
    name: '1-2 In & Out',
    category: 'punches',
    focus: 'Step in with the jab-cross, then step back out of range.',
    moves: ['FORWARD_STEP', 'JAB', 'CROSS', 'BACKWARD_STEP'],
  },
  {
    id: 'lateral-one-two',
    name: 'Lateral 1-2',
    category: 'punches',
    focus: 'Move side to side and throw the 1-2 once you are set.',
    moves: ['LEFT_STEP', 'JAB', 'CROSS', 'RIGHT_STEP', 'JAB', 'CROSS'],
  },
  {
    id: 'jab-pivot',
    name: 'Jab & Pivot Out',
    category: 'punches',
    focus: 'Jab, pivot off the line, cross from the new angle, pivot back.',
    moves: ['JAB', 'PIVOT_LEFT', 'CROSS', 'PIVOT_RIGHT'],
  },
];

export const COMBINATION_RULES = {
  allowed: {
    BEGINNER: ['FORWARD_STEP', 'BACKWARD_STEP', 'LEFT_STEP', 'RIGHT_STEP'],
    INTERMEDIATE: ['FORWARD_STEP', 'BACKWARD_STEP', 'LEFT_STEP', 'RIGHT_STEP', 'PIVOT_LEFT', 'PIVOT_RIGHT'],
    ADVANCED: [
      'FORWARD_STEP', 'BACKWARD_STEP', 'LEFT_STEP', 'RIGHT_STEP',
      'FORWARD_LEFT', 'FORWARD_RIGHT', 'BACKWARD_LEFT', 'BACKWARD_RIGHT',
      'DASH_FORWARD', 'DASH_BACKWARD', 'PIVOT_LEFT', 'PIVOT_RIGHT',
      'JAB', 'CROSS',
    ],
  } as Record<Level, MovementId[]>,
  /** Max pivots in one round. */
  maxPivots: { BEGINNER: 0, INTERMEDIATE: 1, ADVANCED: 3 } as Record<Level, number>,
  /** Keep the fighter inside the camera frame: max net steps away from the start, per axis (a dash = 2). */
  maxDrift: 2,
  /** Net rotation limit, in pivots (so the user never ends up with their back to the camera). */
  maxNetPivots: 1,
} as const;

/** Small deterministic PRNG (mulberry32). Same seed → same combination. */
export function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Position {
  lateral: number;
  forward: number;
  rotation: number;
  pivots: number;
}

const start = (): Position => ({ lateral: 0, forward: 0, rotation: 0, pivots: 0 });

function apply(p: Position, id: MovementId): Position {
  const m = MOVEMENTS[id];
  return {
    lateral: p.lateral + m.direction.lateral * m.travel,
    forward: p.forward + m.direction.forward * m.travel,
    rotation: p.rotation + Math.sign(m.rotation),
    pivots: p.pivots + (m.kind === 'pivot' ? 1 : 0),
  };
}

/** Whether `id` may follow `seq` under the level's rules. */
function allowedNext(seq: MovementId[], pos: Position, id: MovementId, level: Level): boolean {
  const R = COMBINATION_RULES;
  const m = MOVEMENTS[id];
  const prev = seq[seq.length - 1];
  // No immediate repeats (every move is a new instruction) — except stance switches, which are
  // drilled back to back.
  if (prev === id && m.kind !== 'switch') return false;
  if (m.kind === 'pivot') {
    if (prev && MOVEMENTS[prev].kind === 'pivot') return false;
    if (pos.pivots >= R.maxPivots[level]) return false;
  }
  const next = apply(pos, id);
  return (
    Math.abs(next.lateral) <= R.maxDrift + 1e-9 &&
    Math.abs(next.forward) <= R.maxDrift + 1e-9 &&
    Math.abs(next.rotation) <= R.maxNetPivots
  );
}

/**
 * Generates a combination from predefined movement rules (no AI). Deterministic for a seed.
 * Rules: level-appropriate moves, no immediate repeats, no back-to-back pivots, and the
 * fighter never drifts more than one step from the start (stays in the camera frame).
 */
export function generateCombination(level: Level, length = PRESETS[level].length, seed = 1): MovementId[] {
  const rand = seededRandom(seed);
  const pool = COMBINATION_RULES.allowed[level];
  // A few restarts in case random choices paint us into a corner (rare with these rules).
  for (let attempt = 0; attempt < 20; attempt++) {
    const seq: MovementId[] = [];
    let pos = start();
    while (seq.length < length) {
      const options = pool.filter((id) => allowedNext(seq, pos, id, level));
      if (options.length === 0) break;
      const id = options[Math.floor(rand() * options.length)];
      seq.push(id);
      pos = apply(pos, id);
    }
    if (seq.length === length) return seq;
  }
  return PRESETS[level].slice(0, length);
}

/** Checks a (custom) combination against the generator's safety rules. */
export function isValidCombination(seq: MovementId[], level: Level = 'ADVANCED'): boolean {
  let pos = start();
  for (let i = 0; i < seq.length; i++) {
    if (!allowedNext(seq.slice(0, i), pos, seq[i], level)) return false;
    pos = apply(pos, seq[i]);
  }
  return true;
}
