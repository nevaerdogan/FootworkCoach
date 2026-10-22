import { vec, type Vec2 } from '../footwork/geometry';
import type { Landmark, LandmarkName, PoseFrame } from '../pose/types';

export type Side = 'left' | 'right';
export type Joint = 'shoulder' | 'elbow' | 'wrist' | 'hip' | 'knee' | 'ankle';

export function jointName(side: Side, j: Joint): LandmarkName {
  return `${side}${j[0].toUpperCase()}${j.slice(1)}` as LandmarkName;
}

export const joint = (f: PoseFrame, side: Side, j: Joint): Landmark => f[jointName(side, j)];

/** Joint position in aspect-corrected image space (x and y share one unit). */
export const jointVec = (f: PoseFrame, side: Side, j: Joint): Vec2 => vec(joint(f, side, j), f.aspect);

/** Angle at `b` between b→a and b→c, in degrees (0 folded .. 180 straight). */
export function angleAt(a: Vec2, b: Vec2, c: Vec2): number {
  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const cbx = c.x - b.x;
  const cby = c.y - b.y;
  const mag = Math.hypot(abx, aby) * Math.hypot(cbx, cby);
  if (mag === 0) return 180;
  const cos = Math.max(-1, Math.min(1, (abx * cbx + aby * cby) / mag));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Inclination of the a→b line from the image horizontal: 0 = flat on the floor line, 90 = upright. */
export function inclineDeg(a: Vec2, b: Vec2): number {
  return (Math.atan2(Math.abs(b.y - a.y), Math.abs(b.x - a.x)) * 180) / Math.PI;
}

/**
 * Picks the body side facing the camera: in a side view the near side is clearly visible, the far
 * side is guessed. Hysteresis keeps the choice from flipping frame to frame (a flip would read the
 * far arm's noisy angle as a movement).
 */
export class SidePicker {
  private side: Side = 'left';

  constructor(
    private joints: Joint[],
    private margin: number,
  ) {}

  pick(f: PoseFrame): Side {
    const score = (s: Side) => this.joints.reduce((sum, j) => sum + joint(f, s, j).visibility, 0) / this.joints.length;
    const other: Side = this.side === 'left' ? 'right' : 'left';
    if (score(other) > score(this.side) + this.margin) this.side = other;
    return this.side;
  }

  reset() {
    this.side = 'left';
  }
}
