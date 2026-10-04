/**
 * Analysis coordinates: normalized to the RAW (unmirrored) camera image.
 * x, y in 0..1 (y grows downward). z is MediaPipe's relative depth (smaller = closer
 * to camera), used only for heuristics. left/right are the user's ANATOMICAL sides.
 * Display mirroring is applied purely in CSS and never touches these values.
 */
export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

/** MediaPipe world landmark: meters, origin at hip center, z smaller = closer to camera. */
export interface WorldPoint {
  x: number;
  y: number;
  z: number;
}

/** 3D upper-body points: torso for the pivot (body yaw) heuristic, arms for punch detection. */
export interface WorldTorso {
  leftShoulder: WorldPoint;
  rightShoulder: WorldPoint;
  leftHip: WorldPoint;
  rightHip: WorldPoint;
  leftElbow: WorldPoint;
  rightElbow: WorldPoint;
  leftWrist: WorldPoint;
  rightWrist: WorldPoint;
}

export interface PoseFrame {
  timestamp: number;
  /** Image width / height. Needed for distances, since normalized x and y use different pixel scales. */
  aspect: number;
  world: WorldTorso | null;
  nose: Landmark;
  leftShoulder: Landmark;
  rightShoulder: Landmark;
  leftElbow: Landmark;
  rightElbow: Landmark;
  leftWrist: Landmark;
  rightWrist: Landmark;
  leftHip: Landmark;
  rightHip: Landmark;
  leftKnee: Landmark;
  rightKnee: Landmark;
  leftAnkle: Landmark;
  rightAnkle: Landmark;
  leftHeel: Landmark;
  rightHeel: Landmark;
  leftFootIndex: Landmark;
  rightFootIndex: Landmark;
}

export type LandmarkName = Exclude<keyof PoseFrame, 'timestamp' | 'aspect' | 'world'>;
