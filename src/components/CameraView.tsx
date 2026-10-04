import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { drawSkeleton, type SkeletonStyle } from '../pose/drawSkeleton';
import { loadPoseEstimator, reportFrameError } from '../pose/PoseEstimator';
import type { PoseFrame } from '../pose/types';
import { Icon } from './Icon';
import { DebugPanel, isDebugMode } from './DebugPanel';
import './CameraView.css';

export type CameraStatus = 'loading' | 'live' | 'denied' | 'unavailable' | 'insecure' | 'error';

type FrameHandler = (frame: PoseFrame | null) => void;
const FrameContext = createContext<((fn: FrameHandler) => () => void) | null>(null);

/**
 * Subscribe a child of <CameraView> to every pose frame (high frequency, no re-render).
 * Keep work light and store results in refs; only set state on visible changes.
 */
export function usePoseFrames(handler: FrameHandler) {
  const subscribe = useContext(FrameContext);
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => subscribe?.((f) => ref.current(f)), [subscribe]);
}

interface Props {
  children?: React.ReactNode;
}

/**
 * Webcam stage: mirrored preview + skeleton overlay. The camera stream stays local;
 * frames never leave the browser. React state only changes on status transitions.
 */
export function CameraView({ children }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<PoseFrame | null>(null);
  const subscribersRef = useRef(new Set<FrameHandler>());
  const subscribe = useCallback((fn: FrameHandler) => {
    subscribersRef.current.add(fn);
    return () => {
      subscribersRef.current.delete(fn);
    };
  }, []);
  const [status, setStatus] = useState<CameraStatus>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let stopEstimator: (() => void) | null = null;
    setStatus('loading');

    const styleFor = (canvas: HTMLCanvasElement): SkeletonStyle => {
      const css = getComputedStyle(canvas);
      return {
        line: css.getPropertyValue('--text').trim() || '#fff',
        joint: css.getPropertyValue('--text').trim() || '#fff',
        foot: css.getPropertyValue('--accent').trim() || '#ff5a1f',
      };
    };
    /** One frame → overlay + every subscriber. A failing subscriber never stops the others or the loop. */
    const makeDispatch = (ctx: CanvasRenderingContext2D, style: SkeletonStyle) => (frame: PoseFrame | null) => {
      frameRef.current = frame;
      drawSkeleton(ctx, frame, style);
      subscribersRef.current.forEach((fn) => {
        try {
          fn(frame);
        } catch (err) {
          reportFrameError(err);
        }
      });
    };

    (async () => {
      // Dev only: ?synthetic replaces the webcam with scripted poses through the same pipeline.
      if (import.meta.env.DEV && new URLSearchParams(location.search).has('synthetic')) {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = 1280;
        canvas.height = 720;
        const { startSyntheticFeed } = await import('../dev/syntheticFeed');
        if (cancelled) return;
        stopEstimator = startSyntheticFeed(makeDispatch(canvas.getContext('2d')!, styleFor(canvas)));
        setStatus('live');
        return;
      }
      // Browsers only expose the camera on HTTPS (or localhost).
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setStatus('insecure');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: false,
        });
      } catch (err) {
        if (cancelled) return;
        const name = (err as DOMException)?.name;
        setStatus(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable');
        return;
      }
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (cancelled || !video || !canvas) return;
      video.srcObject = stream;
      await video.play().catch(() => {});

      try {
        const estimator = await loadPoseEstimator();
        if (cancelled) return;
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        const dispatch = makeDispatch(canvas.getContext('2d')!, styleFor(canvas));
        estimator.start(video, (frame) => {
          // Rotating a phone flips the stream's shape: keep the overlay matched to the video.
          if (video.videoWidth && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }
          dispatch(frame);
        });
        stopEstimator = () => estimator.stop();
        setStatus('live');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      stopEstimator?.();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [attempt]);

  return (
    <div className="camera">
      <div className="camera-feed mirror">
        <video ref={videoRef} playsInline muted />
        <canvas ref={canvasRef} />
      </div>
      <div className="camera-vignette" />

      {status === 'live' ? (
        <FrameContext.Provider value={subscribe}>{children}</FrameContext.Provider>
      ) : (
        <CameraState status={status} onRetry={() => setAttempt((a) => a + 1)} />
      )}

      {isDebugMode() && <DebugPanel frameRef={frameRef} />}
    </div>
  );
}

const STATE_COPY: Record<Exclude<CameraStatus, 'live'>, { title: string; body: string; retry: boolean }> = {
  loading: { title: 'Getting ready', body: 'Preparing movement tracking…', retry: false },
  denied: {
    title: 'Camera access needed',
    body: 'Allow camera access for this site in your browser settings, then try again.',
    retry: true,
  },
  unavailable: {
    title: 'No camera found',
    body: 'Check that a camera is connected and no other app is using it.',
    retry: true,
  },
  insecure: {
    title: 'Secure connection needed',
    body: 'The camera only works over HTTPS. Open this page with https://.',
    retry: false,
  },
  error: {
    title: 'Tracking unavailable',
    body: 'Movement tracking could not start. Check your connection and try again.',
    retry: true,
  },
};

function CameraState({ status, onRetry }: { status: Exclude<CameraStatus, 'live'>; onRetry: () => void }) {
  const copy = STATE_COPY[status];
  return (
    <div className="camera-state reveal" key={status}>
      {status === 'loading' ? <div className="loader" /> : <Icon name="camera" className="camera-state-icon" />}
      <h2 className="h2">{copy.title}</h2>
      <p className="muted">{copy.body}</p>
      {copy.retry && (
        <button className="btn btn-primary" onClick={onRetry}>
          <Icon name="refresh" /> Try again
        </button>
      )}
    </div>
  );
}
