/**
 * JUMP ROPE COUNTER (front view).
 *
 * Signal: hip-centre height above a slowly following resting height, in torso lengths (camera
 * distance cancels out). Every upward excursion that clears the minimum amplitude and comes back
 * down is a candidate jump, as in the shuffle detector, with two extra rules that matter for rope
 * skipping:
 *   • the ankles must rise too (a knee bend lifts the hips back to standing height but the feet
 *     never leave the floor), and
 *   • a candidate must reach half the height of the recent jumps, so the small rebound hop of the
 *     "double bounce" style is not counted as a second jump.
 * The rope itself is not tracked: jumps are counted, which is what a rope counter reports.
 */
import { REP_CONFIG } from '../config';
import { bodyPoints } from '../footwork/geometry';
import type { PoseFrame } from '../pose/types';
import { inclineDeg, jointVec } from './geometry';
import type { RepEvent } from './RepCounter';
import type { ExerciseCounter, RepUpdate, Tracking } from './types';

type JumpConfig = typeof REP_CONFIG.jump;

/** Smoothed height signal and its resting baseline (fast to drop, slow to rise). */
class HeightTrack {
  private y: number | null = null;
  private base: number | null = null;

  constructor(private cfg: JumpConfig) {}

  /** Returns the rise above the resting height (torso units, + = body above its baseline). */
  push(rawY: number): number {
    this.y = this.y === null ? rawY : this.y + this.cfg.alpha * (rawY - this.y);
    if (this.base === null) this.base = this.y;
    else {
      const a = this.y > this.base ? this.cfg.baselineDownAlpha : this.cfg.baselineAlpha;
      this.base += a * (this.y - this.base);
    }
    return this.base - this.y;
  }

  reset() {
    this.y = this.base = null;
  }
}

export class JumpCounter implements ExerciseCounter {
  readonly id = 'JUMP_ROPE' as const;
  private reps = 0;
  private hips: HeightTrack;
  private ankles: HeightTrack;
  private rising = false;
  private peak = 0;
  private peakT = 0;
  private anklePeak = 0;
  private ankleSeen = false;
  private lastJump = -Infinity;
  /** Heights of the last accepted jumps: the typical jump height adapts to the athlete. */
  private recent: number[] = [];
  private lostSince: number | null = null;
  private lastT = 0;
  private lastRise = 0;

  constructor(
    private cfg = REP_CONFIG,
    private jump: JumpConfig = cfg.jump,
  ) {
    this.hips = new HeightTrack(this.jump);
    this.ankles = new HeightTrack(this.jump);
  }

  push(frame: PoseFrame | null, now?: number): RepUpdate {
    const t = frame?.timestamp ?? now ?? this.lastT;
    this.lastT = t;
    const J = this.jump;
    const minVis = this.cfg.minVisibility;
    if (!frame || frame.leftHip.visibility < minVis || frame.rightHip.visibility < minVis) return this.lost(t);
    const kneesOk = frame.leftKnee.visibility >= minVis || frame.rightKnee.visibility >= minVis;
    if (!kneesOk) return this.lost(t);
    this.lostSince = null;

    const p = bodyPoints(frame);
    if (!(p.torso > 0)) return this.lost(t);
    const anklesOk = frame.leftAnkle.visibility >= minVis && frame.rightAnkle.visibility >= minVis;
    // Standing check from the better-visible leg: hip above the foot, leg near upright.
    const side = frame.leftKnee.visibility >= frame.rightKnee.visibility ? 'left' : 'right';
    const hip = jointVec(frame, side, 'hip');
    const foot = anklesOk ? jointVec(frame, side, 'ankle') : jointVec(frame, side, 'knee');
    if (foot.y <= hip.y || inclineDeg(hip, foot) < J.minLegIncline) {
      this.abort();
      return this.update(0, 'posture', null, 'Stand up and face the camera');
    }

    const rise = this.hips.push(p.hipCenter.y / p.torso);
    this.lastRise = rise;
    const ankleRise = anklesOk ? this.ankles.push((p.leftAnkle.y + p.rightAnkle.y) / 2 / p.torso) : null;

    let event: RepEvent | null = null;
    if (!this.rising) {
      if (rise >= J.minAmplitude) {
        this.rising = true;
        this.peak = rise;
        this.peakT = t;
        this.anklePeak = ankleRise ?? 0;
        this.ankleSeen = ankleRise !== null;
      }
    } else {
      if (rise > this.peak) {
        this.peak = rise;
        this.peakT = t;
      }
      if (ankleRise !== null) {
        this.anklePeak = Math.max(this.anklePeak, ankleRise);
        this.ankleSeen = true;
      }
      // Back down past half the threshold: the excursion is over.
      if (rise < J.minAmplitude / 2) {
        this.rising = false;
        event = this.judge(t);
      }
    }
    return this.update(Math.min(1, rise / (this.typical() ?? J.gaugeAmplitude)), 'ok', event, null);
  }

  reset() {
    this.reps = 0;
    this.recent = [];
    this.lastJump = -Infinity;
    this.hips.reset();
    this.ankles.reset();
    this.abort();
  }

  /** Typical height of this athlete's jumps (median of the recent ones); null before the first jump. */
  private typical(): number | null {
    if (!this.recent.length) return null;
    const s = [...this.recent].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }

  private judge(t: number): RepEvent | null {
    const J = this.jump;
    const typical = this.typical();
    const needed = Math.max(J.minAmplitude, typical === null ? 0 : J.relativeAmplitude * typical);
    const feetLeftFloor = !this.ankleSeen || this.anklePeak >= J.minAnkleRise;
    if (this.peak < needed || !feetLeftFloor || this.peakT - this.lastJump < J.minIntervalMs) return null;
    this.reps++;
    this.lastJump = this.peakT;
    this.recent.push(this.peak);
    if (this.recent.length > 8) this.recent.shift();
    return { kind: 'rep', t: this.peakT, count: this.reps, peak: this.peak, durationMs: t - this.peakT };
  }

  private abort() {
    this.rising = false;
    this.lastRise = 0;
  }

  private lost(t: number): RepUpdate {
    this.lostSince ??= t;
    if (t - this.lostSince > this.cfg.lostTimeoutMs) {
      this.abort();
      this.hips.reset();
      this.ankles.reset();
    }
    return this.update(Math.min(1, Math.max(0, this.lastRise) / (this.typical() ?? this.jump.gaugeAmplitude)), 'lost', null, null);
  }

  private update(progress: number, tracking: Tracking, event: RepEvent | null, hint: string | null): RepUpdate {
    return { reps: this.reps, partials: 0, progress: Math.max(0, progress), tracking, event, hint };
  }
}
