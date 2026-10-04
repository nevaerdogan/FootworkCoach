import { useEffect, useMemo, useState } from 'react';
import { TRAINING_CONFIG, type Stance } from '../config';
import { buildTimeline, fightingStance, rotateAround, type DemoPose, type FootPose } from '../demo/demoTimeline';
import { MOVEMENTS, type MovementId } from '../movements';
import './FootworkDiagram.css';

/*
 * A coach's footwork diagram: chalk footprints on the mat, numbered in order, joined by dotted
 * arrows. Top-down, camera at the top (forward = up), user's right = right — same as the demo.
 * Positions come from the same demo timeline (and so the same movement definitions) as everything else.
 */

/** Shoe-sole outline, toe up, 26 units long (≈ 0.26 m). Drawn for a left foot; mirrored for the right. */
const SOLE =
  'M0.6,-13 C4.6,-13 6.6,-8.6 6.2,-3.4 C5.9,0.4 4.4,3.2 4.2,6.4 C4,10 3.6,13 0.2,13 C-3.4,13 -4.2,10.4 -4.4,7.4 C-4.6,4 -6.6,0.6 -6.6,-3.6 C-6.6,-9.2 -3.6,-13 0.6,-13 Z';
const FOOT_M = 0.26;

interface Mark {
  index: number;
  id: MovementId;
  from: DemoPose;
  to: DemoPose;
  moving: 'left' | 'right' | null;
  pivotFoot: 'left' | 'right' | null;
}

interface Props {
  combination: MovementId[];
  stance?: Stance;
  /** Animate the marks one by one, then loop. */
  animate?: boolean;
  stepMs?: number;
  /** Thumbnail: no numbers, lighter strokes. */
  compact?: boolean;
  className?: string;
  /** Notified when the animated step changes (-1 = start stance only). */
  onStep?: (index: number) => void;
}

export function FootworkDiagram({ combination, stance = TRAINING_CONFIG.stance, animate = false, stepMs = 900, compact = false, className = '', onStep }: Props) {
  const { marks, start, view, scale } = useMemo(() => {
    const tl = buildTimeline(combination, stance);
    const start = fightingStance(stance);
    const marks: Mark[] = tl.steps.map((s, index) => ({
      index,
      id: s.movement,
      from: s.from,
      to: s.to,
      moving: s.arm ? null : s.movingFoot,
      pivotFoot: s.pivotFoot,
    }));
    const pts = [start, ...marks.map((m) => m.to)].flatMap((p) => [p.left, p.right]);
    const xs = pts.map((p) => p.x);
    const zs = pts.map((p) => p.z);
    const pad = compact ? 0.24 : 0.2;
    const x0 = Math.min(...xs) - pad;
    const x1 = Math.max(...xs) + pad;
    const z0 = Math.min(...zs) - pad;
    const z1 = Math.max(...zs) + pad;
    const W = 320;
    const H = 260;
    const scale = Math.min(W / (x1 - x0), H / (z1 - z0));
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    return { marks, start, scale, view: { W, H, cx, cz } };
  }, [combination, stance, compact]);

  // Animation: reveal marks one by one, hold, restart.
  const [shown, setShown] = useState(animate ? 0 : marks.length);
  useEffect(() => {
    if (!animate) {
      setShown(marks.length);
      return;
    }
    setShown(0);
    let n = 0;
    const id = setInterval(() => {
      n = n >= marks.length + 2 ? 0 : n + 1;
      setShown(Math.min(n, marks.length));
    }, stepMs);
    return () => clearInterval(id);
  }, [animate, marks.length, stepMs]);
  useEffect(() => onStep?.(shown - 1), [shown, onStep]);

  const P = (x: number, z: number) => ({ X: view.W / 2 + (x - view.cx) * scale, Y: view.H / 2 - (z - view.cz) * scale });
  const unit = (FOOT_M * scale) / 26;

  const foot = (f: FootPose, side: 'left' | 'right', cls: string, key: string) => {
    const r = (f.angle * Math.PI) / 180;
    // Pose point sits near the heel; the sole's centre is ~5 cm toward the toe.
    const c = P(f.x - Math.sin(r) * 0.055, f.z + Math.cos(r) * 0.055);
    const mirror = side === 'right' ? -1 : 1;
    return (
      <path
        key={key}
        className={`fd-foot ${cls}`}
        d={SOLE}
        transform={`translate(${c.X.toFixed(1)} ${c.Y.toFixed(1)}) rotate(${(-f.angle).toFixed(1)}) scale(${(unit * mirror).toFixed(3)} ${unit.toFixed(3)})`}
      />
    );
  };
  const center = (p: DemoPose) => P((p.left.x + p.right.x) / 2, (p.left.z + p.right.z) / 2);

  const visible = marks.slice(0, shown);
  const latest = shown - 1;

  return (
    <svg
      className={`fd ${compact ? 'is-compact' : ''} ${className}`}
      viewBox={`0 0 ${view.W} ${view.H}`}
      role="img"
      aria-label={`Footwork diagram: ${combination.map((id) => MOVEMENTS[id].label).join(', ')}`}
    >
      <defs>
        <marker id="fd-head" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10" className="fd-head" />
        </marker>
        <marker id="fd-head-live" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10" className="fd-head is-live" />
        </marker>
      </defs>

      {/* Tape cross: where the stance starts. */}
      {(() => {
        const c = center(start);
        const s = 10;
        return (
          <g className="fd-tape">
            <line x1={c.X - s} y1={c.Y} x2={c.X + s} y2={c.Y} />
            <line x1={c.X} y1={c.Y - s} x2={c.X} y2={c.Y + s} />
          </g>
        );
      })()}

      {foot(start.left, 'left', 'is-start', 'sl')}
      {foot(start.right, 'right', 'is-start', 'sr')}

      {visible.map((m) => {
        const live = m.index === latest;
        const a = center(m.from);
        const b = center(m.to);
        const def = MOVEMENTS[m.id];
        const cls = live ? 'is-live' : 'is-past';
        let path: string | null = null;
        if (def.kind === 'pivot' && m.pivotFoot) {
          const pv = m.from[m.pivotFoot];
          const sw = m.from[m.pivotFoot === 'left' ? 'right' : 'left'];
          const pts: string[] = [];
          for (let i = 0; i <= 16; i++) {
            const q = rotateAround(sw.x, sw.z, pv.x, pv.z, def.rotation * (i / 16));
            const p = P(q.x, q.z);
            pts.push(`${p.X.toFixed(1)},${p.Y.toFixed(1)}`);
          }
          path = `M${pts.join(' L')}`;
        } else if (def.kind === 'step' || (def.kind === 'switch' && def.travel > 0)) {
          // Slight bow so overlapping back-and-forth arrows stay readable.
          const mx = (a.X + b.X) / 2 - (b.Y - a.Y) * 0.12;
          const my = (a.Y + b.Y) / 2 + (b.X - a.X) * 0.12;
          path = `M${a.X.toFixed(1)},${a.Y.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${b.X.toFixed(1)},${b.Y.toFixed(1)}`;
        }
        return (
          <g key={m.index} className={`fd-mark ${cls}`}>
            {path && <path className="fd-arrow" d={path} markerEnd={`url(#${live ? 'fd-head-live' : 'fd-head'})`} />}
            {/* Footprints only for the current step; earlier steps leave their numbered path. */}
            {def.kind !== 'punch' && def.kind !== 'rhythm' && (live || (compact && m.index === marks.length - 1)) && (
              <>
                {(m.moving !== 'right' || def.kind !== 'pivot') && foot(m.to.left, 'left', cls, `l${m.index}`)}
                {(m.moving !== 'left' || def.kind !== 'pivot') && foot(m.to.right, 'right', cls, `r${m.index}`)}
              </>
            )}
            {(def.kind === 'punch' || def.kind === 'rhythm') && (
              <g transform={`translate(${b.X.toFixed(1)} ${(b.Y - 34).toFixed(1)})`}>
                <circle className="fd-punch" r={compact ? 7 : 9} />
                <text className="fd-punch-label" dy="0.35em">
                  {m.id === 'JAB' ? 'J' : m.id === 'CROSS' ? 'C' : '~'}
                </text>
              </g>
            )}
            {!compact && def.kind !== 'punch' && def.kind !== 'rhythm' && !live && (
              <circle className="fd-dot" cx={b.X} cy={b.Y} r="3" />
            )}
            {!compact && (
              <g transform={`translate(${(b.X + 16).toFixed(1)} ${(b.Y - 14).toFixed(1)})`}>
                <circle className="fd-num-bg" r="9" />
                <text className="fd-num" dy="0.35em">
                  {m.index + 1}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
