import { useEffect, useRef } from 'react';
import type { PoseFrame } from '../pose/types';

/** Developer-only. Enabled with ?debug in the URL. Never shown to normal users. */
export function isDebugMode(): boolean {
  return new URLSearchParams(window.location.search).has('debug');
}

/** Free-form debug values written by analysis code (e.g. detector state). Read by the panel. */
export const debugInfo: Record<string, string> = {};

/** Formats the live arm signals for the panel. */
export function armDebug(arms?: Partial<Record<'left' | 'right', { ext: number; forward: number; score: number }>>) {
  if (!arms) return;
  for (const side of ['left', 'right'] as const) {
    const a = arms[side];
    debugInfo[side === 'left' ? 'L arm' : 'R arm'] = a
      ? 'ext ' + a.ext.toFixed(2) + ' fwd ' + a.forward.toFixed(2) + ' score ' + a.score.toFixed(2)
      : 'not visible';
  }
}

const fmt = (n: number) => n.toFixed(3);

/** Reads refs on an interval and writes textContent directly: no React re-renders. */
export function DebugPanel({ frameRef }: { frameRef: React.RefObject<PoseFrame | null> }) {
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    let frames = 0;
    let fps = 0;
    let lastCount = performance.now();
    let raf = 0;
    let prevTs = 0;
    const loop = () => {
      const f = frameRef.current;
      if (f && f.timestamp !== prevTs) {
        prevTs = f.timestamp;
        frames++;
      }
      const now = performance.now();
      if (now - lastCount >= 500) {
        fps = (frames * 1000) / (now - lastCount);
        frames = 0;
        lastCount = now;
        const lines = [`FPS        ${fps.toFixed(1)}`];
        if (f) {
          lines.push(
            `L ankle    ${fmt(f.leftAnkle.x)} ${fmt(f.leftAnkle.y)}  v${fmt(f.leftAnkle.visibility)}`,
            `R ankle    ${fmt(f.rightAnkle.x)} ${fmt(f.rightAnkle.y)}  v${fmt(f.rightAnkle.visibility)}`,
            `L hip      ${fmt(f.leftHip.x)} ${fmt(f.leftHip.y)}`,
            `R hip      ${fmt(f.rightHip.x)} ${fmt(f.rightHip.y)}`,
          );
        } else {
          lines.push('no pose');
        }
        for (const [k, v] of Object.entries(debugInfo)) lines.push(`${k.padEnd(10)} ${v}`);
        if (preRef.current) preRef.current.textContent = lines.join('\n');
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [frameRef]);

  return (
    <pre
      ref={preRef}
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        zIndex: 50,
        padding: '8px 10px',
        font: '11px/1.5 ui-monospace, Consolas, monospace',
        background: 'rgba(0,0,0,0.7)',
        color: '#9f9',
        pointerEvents: 'none',
      }}
    />
  );
}
