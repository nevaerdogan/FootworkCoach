import { useMemo } from 'react';
import { MOVEMENTS } from '../movements';
import type { MovementScore } from '../training/scoring';
import { buildTrajectory, trajectoryBounds, type Pt } from '../training/trajectory';
import './Trajectory.css';

interface Props {
  movements: MovementScore[];
  /** Highlight one movement (others dim). */
  selected: number | null;
  onSelect?: (index: number | null) => void;
}

const W = 360;
const H = 260;

/**
 * Top-down foot trajectory of the round: camera at the top (forward = up), user's right = right,
 * matching the demo. Shows each foot's path, start/end of every move, and the expected direction.
 */
export function Trajectory({ movements, selected, onSelect }: Props) {
  const segments = useMemo(() => buildTrajectory(movements), [movements]);
  const b = useMemo(() => trajectoryBounds(segments, 0.3), [segments]);
  const scale = Math.min(W / (b.x1 - b.x0), H / (b.y1 - b.y0));
  const ox = (W - (b.x1 - b.x0) * scale) / 2;
  const oy = (H - (b.y1 - b.y0) * scale) / 2;
  const P = (p: Pt) => ({ x: ox + (p.x - b.x0) * scale, y: oy + (b.y1 - p.y) * scale });
  const line = (pts: Pt[]) => pts.map((p) => { const q = P(p); return `${q.x.toFixed(1)},${q.y.toFixed(1)}`; }).join(' ');

  return (
    <figure className="traj">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Foot trajectory">
        <text className="traj-camera" x={W / 2} y={12}>CAMERA</text>
        {segments.map((s) => {
          const dim = selected !== null && selected !== s.index;
          const on = selected === s.index;
          const a = P(s.start);
          const e = P(s.end);
          const x = s.expectedEnd ? P(s.expectedEnd) : null;
          const kind = MOVEMENTS[s.expected].kind;
          return (
            <g
              key={s.index}
              className={`traj-seg is-${s.status} ${dim ? 'is-dim' : ''} ${on ? 'is-on' : ''}`}
              onMouseEnter={() => onSelect?.(s.index)}
              onMouseLeave={() => onSelect?.(null)}
            >
              {x && <line className="traj-expected" x1={a.x} y1={a.y} x2={x.x} y2={x.y} markerEnd="url(#traj-arrow)" />}
              {kind === 'pivot' && <circle className="traj-expected" cx={a.x} cy={a.y} r={14} />}
              <polyline className="traj-left" points={line(s.left)} />
              <polyline className="traj-right" points={line(s.right)} />
              <circle className="traj-start" cx={a.x} cy={a.y} r={3.5} />
              <circle className="traj-end" cx={e.x} cy={e.y} r={3.5} />
              <text className="traj-num" x={e.x + 7} y={e.y - 7}>
                {String(s.index + 1).padStart(2, '0')}
              </text>
            </g>
          );
        })}
        <defs>
          <marker id="traj-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="traj-arrowhead" />
          </marker>
        </defs>
      </svg>
      <figcaption className="traj-legend">
        <span><i className="is-left" /> Left foot</span>
        <span><i className="is-right" /> Right foot</span>
        <span><i className="is-expected" /> Expected</span>
      </figcaption>
    </figure>
  );
}
