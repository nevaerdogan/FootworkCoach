import { READINESS_CONFIG } from '../config';
import { FOOT_SEGMENTS, SKELETON_SEGMENTS } from './landmarks';
import type { LandmarkName, PoseFrame } from './types';

export interface SkeletonStyle {
  line: string;
  joint: string;
  foot: string;
}

const JOINTS: LandmarkName[] = [
  'leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow', 'leftWrist', 'rightWrist',
  'leftHip', 'rightHip', 'leftKnee', 'rightKnee',
];

/**
 * Draws in RAW image coordinates. The canvas is mirrored together with the video via CSS,
 * so no coordinate flipping happens here.
 */
export function drawSkeleton(ctx: CanvasRenderingContext2D, frame: PoseFrame | null, style: SkeletonStyle) {
  const { width: w, height: h } = ctx.canvas;
  ctx.clearRect(0, 0, w, h);
  if (!frame) return;

  const unit = Math.max(w, h) / 400;
  const minVis = READINESS_CONFIG.minVisibility;
  const alpha = (a: LandmarkName, b?: LandmarkName) => {
    const v = Math.min(frame[a].visibility, b ? frame[b].visibility : 1);
    return v >= minVis ? 1 : 0.18;
  };

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.strokeStyle = style.line;
  ctx.lineWidth = unit * 1.6;
  for (const [a, b] of SKELETON_SEGMENTS) {
    ctx.globalAlpha = alpha(a, b) * 0.85;
    ctx.beginPath();
    ctx.moveTo(frame[a].x * w, frame[a].y * h);
    ctx.lineTo(frame[b].x * w, frame[b].y * h);
    ctx.stroke();
  }

  ctx.fillStyle = style.joint;
  for (const j of JOINTS) {
    ctx.globalAlpha = alpha(j);
    ctx.beginPath();
    ctx.arc(frame[j].x * w, frame[j].y * h, unit * 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Feet are the primary signal: draw them heavier, in the accent color.
  ctx.strokeStyle = style.foot;
  ctx.fillStyle = style.foot;
  ctx.lineWidth = unit * 2.6;
  for (const [a, b] of FOOT_SEGMENTS) {
    ctx.globalAlpha = alpha(a, b);
    ctx.beginPath();
    ctx.moveTo(frame[a].x * w, frame[a].y * h);
    ctx.lineTo(frame[b].x * w, frame[b].y * h);
    ctx.stroke();
  }
  for (const a of ['leftAnkle', 'rightAnkle'] as const) {
    ctx.globalAlpha = alpha(a);
    ctx.beginPath();
    ctx.arc(frame[a].x * w, frame[a].y * h, unit * 3.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
