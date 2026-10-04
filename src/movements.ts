import type { IconName } from './components/Icon';
import type { BodyVec } from './footwork/normalization';

/**
 * SINGLE SOURCE OF TRUTH for movements. The combination engine, demo animation,
 * detector and scoring all read these definitions by id.
 */
export type MovementId =
  | 'FORWARD_STEP'
  | 'BACKWARD_STEP'
  | 'LEFT_STEP'
  | 'RIGHT_STEP'
  | 'FORWARD_LEFT'
  | 'FORWARD_RIGHT'
  | 'BACKWARD_LEFT'
  | 'BACKWARD_RIGHT'
  | 'DASH_FORWARD'
  | 'DASH_BACKWARD'
  | 'PIVOT_LEFT'
  | 'PIVOT_RIGHT'
  | 'JAB'
  | 'CROSS'
  | 'SWITCH_STANCE'
  | 'SHIFT_FORWARD'
  | 'BOUNCE';

/**
 * Which foot initiates. Forward/back use stance roles ("lead" = front foot, left for orthodox);
 * lateral steps use the anatomical side, so they are stance-independent.
 */
export type FirstFoot = 'lead' | 'rear' | 'left' | 'right';

export interface MovementDefinition {
  id: MovementId;
  label: string;
  /** Compact label for sequences / HUD. */
  short: string;
  icon: IconName;
  /** switch: the stance flips (orthodox ↔ southpaw); detected by the feet's front/back order. */
  kind: 'step' | 'pivot' | 'punch' | 'switch' | 'rhythm';
  /** Punches: which arm throws (lead = left for orthodox). */
  arm?: 'lead' | 'rear';
  /** Steps: unit direction in body space (+lateral = user's right, +forward = toward camera). Pivots: zero. */
  direction: BodyVec;
  /** Distance covered, in steps (a dash covers two). Used by the demo and the stay-in-frame rule. */
  travel: number;
  /**
   * Pivots: signed body rotation in degrees, + = counter-clockwise seen from above
   * (turning toward the user's left). Steps: 0. Pivot point is the lead foot; the rear foot swings.
   */
  rotation: number;
  firstFoot: FirstFoot;
  /** Core moves are always detectable; others are added when a round contains them. */
  core: boolean;
  detection: {
    /**
     * Steps: typical full displacement (body-scale units, after axis gain); used for scoring and to tell a dash from a step.
     * Punches: expected arm extension ratio at full reach.
     */
    expectedDisplacement: number;
  };
  animation: {
    durationMs: number;
    /** step: one foot then the other. dash: quick push, feet move almost together. */
    style: 'step' | 'dash' | 'pivot' | 'punch' | 'switch' | 'shift' | 'bounce';
  };
}

const D = Math.SQRT1_2;

function step(
  id: MovementId,
  label: string,
  short: string,
  icon: IconName,
  direction: BodyVec,
  firstFoot: FirstFoot,
  opts: { core?: boolean; dash?: boolean } = {},
): MovementDefinition {
  return {
    id,
    label,
    short,
    icon,
    kind: 'step',
    direction,
    travel: opts.dash ? 2 : 1,
    rotation: 0,
    firstFoot,
    core: opts.core ?? false,
    detection: { expectedDisplacement: opts.dash ? 1.0 : 0.5 },
    animation: opts.dash ? { durationMs: 600, style: 'dash' } : { durationMs: 700, style: 'step' },
  };
}

function pivot(id: MovementId, label: string, short: string, icon: IconName, rotation: number): MovementDefinition {
  return {
    id,
    label,
    short,
    icon,
    kind: 'pivot',
    direction: { lateral: 0, forward: 0 },
    travel: 0,
    rotation,
    firstFoot: 'rear',
    core: true,
    detection: { expectedDisplacement: 0 },
    animation: { durationMs: 900, style: 'pivot' },
  };
}

function punch(id: MovementId, label: string, short: string, icon: IconName, arm: 'lead' | 'rear'): MovementDefinition {
  return {
    id,
    label,
    short,
    icon,
    kind: 'punch',
    arm,
    direction: { lateral: 0, forward: 0 },
    travel: 0,
    rotation: 0,
    firstFoot: 'lead',
    core: false,
    detection: { expectedDisplacement: 0.92 },
    animation: { durationMs: 600, style: 'punch' },
  };
}

function stanceChange(
  id: MovementId,
  label: string,
  short: string,
  icon: IconName,
  forward: number,
  style: 'switch' | 'shift',
): MovementDefinition {
  return {
    id,
    label,
    short,
    icon,
    kind: 'switch',
    direction: { lateral: 0, forward },
    travel: forward ? 1 : 0,
    rotation: 0,
    // Shift: the rear foot steps through first. Switch: both feet together (a hop).
    firstFoot: style === 'shift' ? 'rear' : 'lead',
    core: false,
    detection: { expectedDisplacement: forward ? 0.5 : 0 },
    animation: { durationMs: style === 'shift' ? 750 : 650, style },
  };
}

/**
 * Step rule used throughout: the foot closest to the direction of travel moves first.
 * Forward (and forward diagonals) → lead foot. Backward → rear foot. Sideways → that side's foot.
 */
export const MOVEMENTS: Record<MovementId, MovementDefinition> = {
  FORWARD_STEP: step('FORWARD_STEP', 'Forward Step', 'Forward', 'arrowUp', { lateral: 0, forward: 1 }, 'lead', { core: true }),
  BACKWARD_STEP: step('BACKWARD_STEP', 'Backward Step', 'Backward', 'arrowDown', { lateral: 0, forward: -1 }, 'rear', { core: true }),
  LEFT_STEP: step('LEFT_STEP', 'Left Step', 'Left', 'arrowLeft', { lateral: -1, forward: 0 }, 'left', { core: true }),
  RIGHT_STEP: step('RIGHT_STEP', 'Right Step', 'Right', 'arrowRight', { lateral: 1, forward: 0 }, 'right', { core: true }),
  FORWARD_LEFT: step('FORWARD_LEFT', 'Forward + Left', 'Fwd Left', 'arrowUpLeft', { lateral: -D, forward: D }, 'lead'),
  FORWARD_RIGHT: step('FORWARD_RIGHT', 'Forward + Right', 'Fwd Right', 'arrowUpRight', { lateral: D, forward: D }, 'lead'),
  BACKWARD_LEFT: step('BACKWARD_LEFT', 'Backward + Left', 'Back Left', 'arrowDownLeft', { lateral: -D, forward: -D }, 'rear'),
  BACKWARD_RIGHT: step('BACKWARD_RIGHT', 'Backward + Right', 'Back Right', 'arrowDownRight', { lateral: D, forward: -D }, 'rear'),
  DASH_FORWARD: step('DASH_FORWARD', 'Dash Forward', 'Dash Fwd', 'dashUp', { lateral: 0, forward: 1 }, 'lead', { dash: true }),
  DASH_BACKWARD: step('DASH_BACKWARD', 'Dash Back', 'Dash Back', 'dashDown', { lateral: 0, forward: -1 }, 'rear', { dash: true }),
  PIVOT_LEFT: pivot('PIVOT_LEFT', 'Pivot Left', 'Pivot L', 'rotateLeft', 45),
  PIVOT_RIGHT: pivot('PIVOT_RIGHT', 'Pivot Right', 'Pivot R', 'rotateRight', -45),
  JAB: punch('JAB', 'Jab', 'Jab', 'jab', 'lead'),
  CROSS: punch('CROSS', 'Cross', 'Cross', 'cross', 'rear'),
  SWITCH_STANCE: stanceChange('SWITCH_STANCE', 'Switch Stance', 'Switch', 'switch', 0, 'switch'),
  SHIFT_FORWARD: stanceChange('SHIFT_FORWARD', 'Shift Forward', 'Shift', 'shift', 1, 'shift'),
  /** Shuffle: light, continuous bouncing on the balls of the feet. Counted as a rhythm, not a step. */
  BOUNCE: {
    id: 'BOUNCE',
    label: 'Bounce',
    short: 'Bounce',
    icon: 'bounce',
    kind: 'rhythm',
    direction: { lateral: 0, forward: 0 },
    travel: 0,
    rotation: 0,
    firstFoot: 'lead',
    core: false,
    detection: { expectedDisplacement: 0 },
    animation: { durationMs: 1200, style: 'bounce' },
  },
};

export const MOVEMENT_LIST = Object.values(MOVEMENTS);
export const STEP_MOVEMENTS = MOVEMENT_LIST.filter((m) => m.kind === 'step');
export const PIVOT_MOVEMENTS = MOVEMENT_LIST.filter((m) => m.kind === 'pivot');

export const otherStance = (s: 'orthodox' | 'southpaw') => (s === 'orthodox' ? 'southpaw' : 'orthodox');

/** Stance in effect for move `index` (switches and shifts before it flip it). */
export function stanceAt(combination: MovementId[], index: number, initial: 'orthodox' | 'southpaw'): 'orthodox' | 'southpaw' {
  let s = initial;
  for (let i = 0; i < index; i++) if (MOVEMENTS[combination[i]].kind === 'switch') s = otherStance(s);
  return s;
}

/** Anatomical arm for a punch, for the given stance. */
export function punchArmSide(def: MovementDefinition, leadFoot: 'left' | 'right'): 'left' | 'right' {
  const rear = leadFoot === 'left' ? 'right' : 'left';
  return def.arm === 'rear' ? rear : leadFoot;
}
export const CORE_MOVEMENTS = MOVEMENT_LIST.filter((m) => m.core);

/**
 * Movements the detector should consider for a round: the six core moves (so mistakes are
 * still recognized) plus whatever the round contains. Fewer look-alike candidates means
 * fewer misclassifications, e.g. a slightly angled forward step won't be read as a diagonal
 * unless diagonals are part of the round.
 */
export function detectionCandidates(combination?: MovementId[]): MovementDefinition[] {
  if (!combination) return MOVEMENT_LIST;
  const ids = new Set<MovementId>([...CORE_MOVEMENTS.map((m) => m.id), ...combination]);
  return MOVEMENT_LIST.filter((m) => ids.has(m.id));
}

/** Anatomical side of the foot that should move first, for the given stance. */
export function firstFootSide(def: MovementDefinition, leadFoot: 'left' | 'right'): 'left' | 'right' {
  if (def.firstFoot === 'left' || def.firstFoot === 'right') return def.firstFoot;
  const rear = leadFoot === 'left' ? 'right' : 'left';
  return def.firstFoot === 'lead' ? leadFoot : rear;
}
