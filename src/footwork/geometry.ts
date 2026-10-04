import type { Landmark, PoseFrame } from '../pose/types';

/** Aspect-corrected image point: x is scaled by width/height so x and y share one unit. */
export interface Vec2 {
  x: number;
  y: number;
}

export const vec = (lm: Landmark, aspect: number): Vec2 => ({ x: lm.x * aspect, y: lm.y });
export const mid = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
/** Angle of the a→b axis in degrees, image space. */
export const axisAngle = (a: Vec2, b: Vec2) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;

export function meanVec(points: Vec2[]): Vec2 {
  const n = points.length || 1;
  return {
    x: points.reduce((s, p) => s + p.x, 0) / n,
    y: points.reduce((s, p) => s + p.y, 0) / n,
  };
}

export const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / (xs.length || 1);

/** Key body points of a frame in aspect-corrected image space. */
export function bodyPoints(f: PoseFrame) {
  const a = f.aspect;
  const leftAnkle = vec(f.leftAnkle, a);
  const rightAnkle = vec(f.rightAnkle, a);
  const leftHip = vec(f.leftHip, a);
  const rightHip = vec(f.rightHip, a);
  const leftShoulder = vec(f.leftShoulder, a);
  const rightShoulder = vec(f.rightShoulder, a);
  const hipCenter = mid(leftHip, rightHip);
  const shoulderCenter = mid(leftShoulder, rightShoulder);
  return {
    leftAnkle,
    rightAnkle,
    leftHip,
    rightHip,
    leftShoulder,
    rightShoulder,
    hipCenter,
    shoulderCenter,
    stanceCenter: mid(leftAnkle, rightAnkle),
    /**
     * Body scale = torso length (shoulder center → hip center). Chosen over hip width
     * because a bladed fighting stance foreshortens hip width, and it changes when pivoting.
     */
    torso: dist(shoulderCenter, hipCenter),
  };
}
