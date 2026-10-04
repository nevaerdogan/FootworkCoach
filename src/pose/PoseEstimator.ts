import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { POSE_CONFIG } from '../config';
import { toPoseFrame } from './landmarks';
import type { PoseFrame } from './types';

export type FrameListener = (frame: PoseFrame | null) => void;

/**
 * Runs MediaPipe pose detection on a <video> element in its own loop, outside React.
 * Listeners receive every processed frame; consumers should keep high-frequency
 * data in refs and only push low-frequency changes into React state.
 */
export class PoseEstimator {
  private landmarker: PoseLandmarker;
  private video: HTMLVideoElement | null = null;
  private listener: FrameListener | null = null;
  private running = false;
  private lastTs = -1;
  private frameHandle = 0;

  private constructor(landmarker: PoseLandmarker) {
    this.landmarker = landmarker;
  }

  static async create(): Promise<PoseEstimator> {
    const fileset = await FilesetResolver.forVisionTasks(POSE_CONFIG.wasmPath);
    const make = (delegate: 'GPU' | 'CPU') =>
      PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: POSE_CONFIG.modelPath, delegate },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: POSE_CONFIG.minPoseDetectionConfidence,
        minPosePresenceConfidence: POSE_CONFIG.minPosePresenceConfidence,
        minTrackingConfidence: POSE_CONFIG.minTrackingConfidence,
      });
    try {
      return new PoseEstimator(await make('GPU'));
    } catch {
      return new PoseEstimator(await make('CPU'));
    }
  }

  start(video: HTMLVideoElement, listener: FrameListener) {
    this.stop();
    this.video = video;
    this.listener = listener;
    this.running = true;
    this.schedule();
  }

  stop() {
    this.running = false;
    if (this.video && 'cancelVideoFrameCallback' in this.video) {
      this.video.cancelVideoFrameCallback(this.frameHandle);
    }
    cancelAnimationFrame(this.frameHandle);
    this.video = null;
    this.listener = null;
  }

  private schedule() {
    const v = this.video;
    if (!this.running || !v) return;
    if ('requestVideoFrameCallback' in v) {
      this.frameHandle = v.requestVideoFrameCallback(() => this.tick());
    } else {
      this.frameHandle = requestAnimationFrame(() => this.tick());
    }
  }

  private tick() {
    const v = this.video;
    if (!this.running || !v) return;
    if (v.readyState >= 2 && v.videoWidth > 0) {
      // MediaPipe requires strictly increasing timestamps.
      const ts = Math.max(performance.now(), this.lastTs + 1);
      this.lastTs = ts;
      // Never let one bad frame (or a bug downstream) stop the camera loop.
      try {
        this.landmarker.detectForVideo(v, ts, (result) => {
          const raw = result.landmarks[0];
          this.listener?.(raw ? toPoseFrame(raw, ts, v.videoWidth / v.videoHeight, result.worldLandmarks[0]) : null);
        });
      } catch (err) {
        reportFrameError(err);
      }
    }
    this.schedule();
  }
}

let lastReported = '';
/** Log each distinct frame-processing error once (no console flood at 30 fps). */
export function reportFrameError(err: unknown) {
  const msg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
  if (msg === lastReported) return;
  lastReported = msg;
  console.error('[pose] frame processing error:', err);
}

let shared: Promise<PoseEstimator> | null = null;

// Dev only: a running camera loop keeps the old code's closures, so after editing pose code
// hot-swapping would mix old frames with new detectors. Reload the page instead.
if (import.meta.hot) import.meta.hot.dispose(() => location.reload());

/** Loads the model once per page and reuses it across screens. */
export function loadPoseEstimator(): Promise<PoseEstimator> {
  if (!shared) {
    shared = PoseEstimator.create().catch((err) => {
      shared = null;
      throw err;
    });
  }
  return shared;
}
