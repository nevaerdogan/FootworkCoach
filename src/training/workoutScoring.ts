import { WORKOUT_CONFIG } from '../config';
import { MOVEMENTS, type MovementId } from '../movements';
import type { Feedback } from './scoring';
import type { Rep, WorkoutResult } from './WorkoutSession';

export interface RoundStats {
  round: number;
  reps: number;
  correct: number;
  accuracy: number;
  /** Moves per minute of work. */
  tempo: number;
  /** 0..1: how even the time between moves was. */
  rhythm: number;
}

export interface BlockStats {
  name: string;
  reps: number;
  accuracy: number;
  tempo: number;
  targetPerMin: number;
}

export interface WorkoutScore {
  /** 0–100 = accuracy·0.6 + rhythm·0.25 + volume·0.15 (see WORKOUT_CONFIG.weights). */
  overall: number;
  components: { accuracy: number; rhythm: number; volume: number };
  reps: number;
  correct: number;
  tempo: number;
  workSeconds: number;
  rounds: RoundStats[];
  blocks: BlockStats[];
  moves: { id: MovementId; reps: number; accuracy: number }[];
  feedback: Feedback[];
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const C = WORKOUT_CONFIG;

/**
 * Rhythm consistency from the intervals between consecutive moves:
 * 1 − coefficient of variation (std / mean), clamped to 0..1. Steady pace → close to 1.
 */
export function rhythmConsistency(times: number[]): number {
  if (times.length < 3) return times.length ? 1 : 0;
  const gaps = times.slice(1).map((t, i) => t - times[i]).filter((g) => g > 0);
  if (gaps.length < 2) return 1;
  const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  const sd = Math.sqrt(gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length);
  return clamp01(1 - sd / mean);
}

const accuracyOf = (reps: Rep[]) => (reps.length ? reps.filter((r) => r.correct).length / reps.length : 0);

export function scoreWorkout(r: WorkoutResult): WorkoutScore {
  const { workout, reps, workMs } = r;
  const minutes = (ms: number) => ms / 60000;
  const workTotalMs = workMs.flat().reduce((s, x) => s + x, 0);

  const rounds: RoundStats[] = workMs
    .map((row, round) => {
      const rr = reps.filter((x) => x.round === round);
      const ms = row.reduce((s, x) => s + x, 0);
      // Rhythm per block (patterns differ between blocks), averaged.
      const rhythms = workout.blocks
        // Rhythm blocks: the beat comes from the bounces alone.
        .map((blk, b) => rr.filter((x) => x.block === b && (!blk.rhythm || x.expected === 'BOUNCE')).map((x) => x.t))
        .filter((ts) => ts.length >= 3)
        .map(rhythmConsistency);
      return {
        round,
        reps: rr.length,
        correct: rr.filter((x) => x.correct).length,
        accuracy: accuracyOf(rr),
        tempo: ms > 0 ? rr.length / minutes(ms) : 0,
        rhythm: rhythms.length ? rhythms.reduce((s, x) => s + x, 0) / rhythms.length : 0,
        ms,
      };
    })
    .filter((x) => x.ms > 0)
    .map(({ ms: _ms, ...rest }) => rest);

  const blocks: BlockStats[] = workout.blocks.map((b, i) => {
    const br = reps.filter((x) => x.block === i);
    const ms = workMs.reduce((s, row) => s + row[i], 0);
    return { name: b.name, reps: br.length, accuracy: accuracyOf(br), tempo: ms > 0 ? br.length / minutes(ms) : 0, targetPerMin: b.targetPerMin };
  });

  const moveIds = [...new Set(reps.map((x) => x.expected))];
  const moves = moveIds.map((id) => {
    const mr = reps.filter((x) => x.expected === id);
    return { id, reps: mr.length, accuracy: accuracyOf(mr) };
  });

  const accuracy = accuracyOf(reps);
  const withRhythm = rounds.filter((x) => x.reps >= 3);
  const rhythm = withRhythm.length ? withRhythm.reduce((s, x) => s + x.rhythm, 0) / withRhythm.length : 0;
  const targetReps = workout.blocks.reduce((s, b, i) => s + b.targetPerMin * minutes(workMs.reduce((a, row) => a + row[i], 0)), 0);
  const volume = targetReps > 0 ? clamp01(reps.length / targetReps) : 0;
  const overall = Math.round(100 * (accuracy * C.weights.accuracy + rhythm * C.weights.rhythm + volume * C.weights.volume));

  return {
    overall,
    components: { accuracy, rhythm, volume },
    reps: reps.length,
    correct: reps.filter((x) => x.correct).length,
    tempo: workTotalMs > 0 ? reps.length / minutes(workTotalMs) : 0,
    workSeconds: Math.round(workTotalMs / 1000),
    rounds,
    blocks,
    moves,
    feedback: workoutFeedback(rounds, blocks, moves, rhythm, r.endedEarly),
  };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Every line comes from measured data. */
function workoutFeedback(
  rounds: RoundStats[],
  blocks: BlockStats[],
  moves: { id: MovementId; reps: number; accuracy: number }[],
  rhythm: number,
  endedEarly: boolean,
): Feedback[] {
  const issues: string[] = [];
  const positives: string[] = [];

  const first = rounds[0];
  const last = rounds[rounds.length - 1];
  if (rounds.length >= 2 && first.tempo > 0) {
    const change = (last.tempo - first.tempo) / first.tempo;
    if (change <= -C.fatigueDrop) {
      issues.push(`Your tempo dropped ${Math.round(-change * 100)}% from round 1 to round ${last.round + 1}.`);
    } else if (change > -0.05) {
      positives.push(`You kept your pace through to round ${last.round + 1}.`);
    }
  }

  const slow = blocks.filter((b) => b.reps > 0 && b.tempo < b.targetPerMin * 0.75);
  for (const b of slow.slice(0, 1)) {
    issues.push(`${b.name}: ${Math.round(b.tempo)} moves per minute. Target is about ${b.targetPerMin}.`);
  }

  const ranked = moves.filter((m) => m.reps >= 4).sort((a, b) => a.accuracy - b.accuracy);
  if (ranked.length >= 2 && ranked[0].accuracy < 0.75 && ranked[ranked.length - 1].accuracy - ranked[0].accuracy >= 0.15) {
    issues.push(`Your ${MOVEMENTS[ranked[0].id].label.toLowerCase()}s were the least accurate (${pct(ranked[0].accuracy)}).`);
  }

  const total = moves.reduce((s, m) => s + m.reps, 0);
  const hit = moves.reduce((s, m) => s + m.reps * m.accuracy, 0);
  if (total >= 6 && hit / total < 0.6) {
    issues.unshift(`Only ${pct(hit / total)} of your moves matched the cue. Follow the move shown on screen.`);
  }
  if (rhythm > 0 && rhythm < 0.6) issues.push(`Your rhythm was uneven (consistency ${pct(rhythm)}). Aim for a steady beat.`);
  else if (rhythm >= 0.75) positives.push(`Your rhythm was steady (consistency ${pct(rhythm)}).`);

  const best = [...rounds].sort((a, b) => b.accuracy - a.accuracy)[0];
  if (best && best.reps >= 5 && best.accuracy >= 0.8) positives.push(`Round ${best.round + 1} was your most accurate (${pct(best.accuracy)}).`);
  if (endedEarly) issues.push('Workout ended early. Scores cover the time you trained.');

  return [
    ...issues.slice(0, 3).map((text) => ({ tone: 'issue' as const, text })),
    ...positives.slice(0, 2).map((text) => ({ tone: 'positive' as const, text })),
  ];
}
