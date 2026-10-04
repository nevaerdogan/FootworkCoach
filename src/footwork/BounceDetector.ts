/**
 * Shuffle / bounce: light, rhythmic bouncing on the balls of the feet.
 *
 * Signal: hip-centre height relative to a slow-moving baseline, in torso lengths (so camera
 * distance doesn't matter). Each upward excursion (body rises → y falls in the image) that clears
 * the minimum amplitude and comes back down is one bounce. Hysteresis + a minimum interval keep
 * pose jitter from counting.
 */
import { BOUNCE_CONFIG } from '../config';
import { isLandmarkVisible } from '../pose/readiness';
import type { PoseFrame } from '../pose/types';
import { bodyPoints } from './geometry';

export interface Bounce {
  t: number;
  /** Rise above the baseline (torso lengths). */
  amplitude: number;
  /** A clear bounce (amplitude ≥ goodAmplitude); smaller ones count as weak. */
  clear: boolean;
}

export class BounceDetector {
  private y: number | null = null;
  private base: number | null = null;
  private rising = false;
  private peak = 0;
  private peakT = 0;
  private lastBounce = -Infinity;

  constructor(private cfg = BOUNCE_CONFIG) {}

  push(frame: PoseFrame | null): Bounce | null {
    if (!frame || !isLandmarkVisible(frame.leftHip) || !isLandmarkVisible(frame.rightHip)) return null;
    const p = bodyPoints(frame);
    if (!(p.torso > 0)) return null;
    const raw = p.hipCenter.y / p.torso;
    this.y = this.y === null ? raw : this.y + this.cfg.alpha * (raw - this.y);
    // Baseline = resting (lowest) height: it drops quickly to the body's low point and rises only
    // slowly, so the bounce itself doesn't drag it up.
    if (this.base === null) this.base = this.y;
    else {
      const a = this.y > this.base ? this.cfg.baselineDownAlpha : this.cfg.baselineAlpha;
      this.base += a * (this.y - this.base);
    }
    const rise = this.base - this.y; // + = body above its baseline
    const t = frame.timestamp;

    if (!this.rising) {
      if (rise >= this.cfg.minAmplitude) {
        this.rising = true;
        this.peak = rise;
        this.peakT = t;
      }
      return null;
    }
    if (rise > this.peak) {
      this.peak = rise;
      this.peakT = t;
    }
    // Back down past half the threshold: the bounce is complete.
    if (rise < this.cfg.minAmplitude / 2) {
      this.rising = false;
      const gap = this.peakT - this.lastBounce;
      if (gap < this.cfg.minIntervalMs) return null;
      this.lastBounce = this.peakT;
      return { t: this.peakT, amplitude: this.peak, clear: this.peak >= this.cfg.goodAmplitude };
    }
    return null;
  }
}

/** Bounces per minute over the most recent bounces (for live display). */
export function liveTempo(times: number[], window = 6): number {
  const recent = times.slice(-window);
  if (recent.length < 2) return 0;
  const span = recent[recent.length - 1] - recent[0];
  return span > 0 ? ((recent.length - 1) / span) * 60000 : 0;
}
