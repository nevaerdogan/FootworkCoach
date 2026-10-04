import { CALIBRATION_CONFIG, TRAINING_CONFIG, type Stance } from '../config';
import { isLandmarkVisible } from '../pose/readiness';
import type { LandmarkName, PoseFrame } from '../pose/types';
import { axisAngle, bodyPoints, dist, mean, meanVec, type Vec2 } from './geometry';

/** Neutral fighting stance, captured before training. All points are aspect-corrected image space. */
export interface BaselineState {
  stance: Stance;
  leadFoot: 'left' | 'right';
  leftAnkle: Vec2;
  rightAnkle: Vec2;
  stanceCenter: Vec2;
  hipCenter: Vec2;
  shoulderCenter: Vec2;
  /** Torso length; the unit for every normalized displacement. */
  bodyScale: number;
  /** Ankle-to-ankle distance in body-scale units. */
  stanceWidth: number;
  /** Image-space axis angles (deg) and apparent widths (body-scale units), used by pivot heuristics. */
  hipAxisAngle: number;
  shoulderAxisAngle: number;
  hipWidth: number;
  shoulderWidth: number;
  sampleCount: number;
  capturedAt: number;
}

export type CalibrationStatus =
  | { phase: 'waiting'; reason: 'NOT_VISIBLE'; progress: 0 }
  | { phase: 'collecting'; reason?: 'MOVED'; progress: number }
  | { phase: 'done'; progress: 1; baseline: BaselineState };

const REQUIRED: LandmarkName[] = [
  'leftShoulder', 'rightShoulder', 'leftHip', 'rightHip', 'leftAnkle', 'rightAnkle',
];

type Sample = ReturnType<typeof bodyPoints> & { t: number };

/**
 * Collects a short window of still-stance frames and averages them into a BaselineState.
 * Restarts if the feet disappear or drift (the user must actually hold the stance).
 */
export class BaselineCollector {
  private samples: Sample[] = [];
  private result: BaselineState | null = null;

  constructor(
    private cfg = CALIBRATION_CONFIG,
    private stance: Stance = TRAINING_CONFIG.stance,
  ) {}

  reset() {
    this.samples = [];
    this.result = null;
  }

  push(frame: PoseFrame | null): CalibrationStatus {
    if (this.result) return { phase: 'done', progress: 1, baseline: this.result };

    if (!frame || !REQUIRED.every((n) => isLandmarkVisible(frame[n]))) {
      this.samples = [];
      return { phase: 'waiting', reason: 'NOT_VISIBLE', progress: 0 };
    }

    const s: Sample = { ...bodyPoints(frame), t: frame.timestamp };
    const anchor = this.samples[0];
    if (anchor) {
      const drift = Math.max(dist(s.leftAnkle, anchor.leftAnkle), dist(s.rightAnkle, anchor.rightAnkle));
      if (drift / anchor.torso > this.cfg.stillnessTolerance) {
        this.samples = [s];
        return { phase: 'collecting', reason: 'MOVED', progress: 0 };
      }
    }
    this.samples.push(s);

    const elapsed = s.t - this.samples[0].t;
    const progress = Math.min(1, elapsed / this.cfg.durationMs);
    if (elapsed >= this.cfg.durationMs && this.samples.length >= this.cfg.minFrames) {
      this.result = this.compute(s.t);
      return { phase: 'done', progress: 1, baseline: this.result };
    }
    return { phase: 'collecting', progress: Math.min(progress, 0.99) };
  }

  private compute(capturedAt: number): BaselineState {
    const S = this.samples;
    const pick = (k: keyof Omit<Sample, 't' | 'torso'>) => meanVec(S.map((s) => s[k]));
    const bodyScale = mean(S.map((s) => s.torso));
    const leftAnkle = pick('leftAnkle');
    const rightAnkle = pick('rightAnkle');
    const leftHip = pick('leftHip');
    const rightHip = pick('rightHip');
    const leftShoulder = pick('leftShoulder');
    const rightShoulder = pick('rightShoulder');
    return {
      stance: this.stance,
      leadFoot: this.stance === 'orthodox' ? 'left' : 'right',
      leftAnkle,
      rightAnkle,
      stanceCenter: pick('stanceCenter'),
      hipCenter: pick('hipCenter'),
      shoulderCenter: pick('shoulderCenter'),
      bodyScale,
      stanceWidth: dist(leftAnkle, rightAnkle) / bodyScale,
      hipAxisAngle: axisAngle(rightHip, leftHip),
      shoulderAxisAngle: axisAngle(rightShoulder, leftShoulder),
      hipWidth: dist(leftHip, rightHip) / bodyScale,
      shoulderWidth: dist(leftShoulder, rightShoulder) / bodyScale,
      sampleCount: S.length,
      capturedAt,
    };
  }
}
