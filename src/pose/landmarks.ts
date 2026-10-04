import type { Landmark, LandmarkName, PoseFrame, WorldTorso } from './types';

/** MediaPipe Pose landmark indices. MediaPipe's left/right are the subject's anatomical sides. */
export const LANDMARK_INDEX: Record<LandmarkName, number> = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftFootIndex: 31,
  rightFootIndex: 32,
};

interface RawLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export function toPoseFrame(
  raw: RawLandmark[],
  timestamp: number,
  aspect = 16 / 9,
  world?: RawLandmark[],
): PoseFrame {
  const frame = { timestamp, aspect, world: world ? toWorldTorso(world) : null } as PoseFrame;
  for (const name of Object.keys(LANDMARK_INDEX) as LandmarkName[]) {
    const p = raw[LANDMARK_INDEX[name]];
    const lm: Landmark = { x: p.x, y: p.y, z: p.z, visibility: p.visibility ?? 0 };
    frame[name] = lm;
  }
  return frame;
}

function toWorldTorso(w: RawLandmark[]): WorldTorso {
  const pick = (i: number) => ({ x: w[i].x, y: w[i].y, z: w[i].z });
  return {
    leftShoulder: pick(LANDMARK_INDEX.leftShoulder),
    rightShoulder: pick(LANDMARK_INDEX.rightShoulder),
    leftHip: pick(LANDMARK_INDEX.leftHip),
    rightHip: pick(LANDMARK_INDEX.rightHip),
    leftElbow: pick(LANDMARK_INDEX.leftElbow),
    rightElbow: pick(LANDMARK_INDEX.rightElbow),
    leftWrist: pick(LANDMARK_INDEX.leftWrist),
    rightWrist: pick(LANDMARK_INDEX.rightWrist),
  };
}

/** Skeleton segments used for display. */
export const SKELETON_SEGMENTS: [LandmarkName, LandmarkName][] = [
  ['leftShoulder', 'rightShoulder'],
  ['leftShoulder', 'leftElbow'],
  ['leftElbow', 'leftWrist'],
  ['rightShoulder', 'rightElbow'],
  ['rightElbow', 'rightWrist'],
  ['leftShoulder', 'leftHip'],
  ['rightShoulder', 'rightHip'],
  ['leftHip', 'rightHip'],
  ['leftHip', 'leftKnee'],
  ['leftKnee', 'leftAnkle'],
  ['rightHip', 'rightKnee'],
  ['rightKnee', 'rightAnkle'],
];

export const FOOT_SEGMENTS: [LandmarkName, LandmarkName][] = [
  ['leftAnkle', 'leftHeel'],
  ['leftHeel', 'leftFootIndex'],
  ['leftAnkle', 'leftFootIndex'],
  ['rightAnkle', 'rightHeel'],
  ['rightHeel', 'rightFootIndex'],
  ['rightAnkle', 'rightFootIndex'],
];
