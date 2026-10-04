import { useEffect, useMemo, useRef, useState } from 'react';
import type { Stance } from '../config';
import {
  buildTimeline,
  easeInOut,
  rotateAround,
  sampleTimeline,
  type AnimationStep,
  type DemoPose,
  type DemoSample,
  type FootPose,
} from '../demo/demoTimeline';
import type { MovementId } from '../movements';
import { useMediaQuery } from './useMediaQuery';
import './FootworkDemo.css';

/* ---------- Projection: high camera behind the fighter (steep, so feet and floor stay readable) ---------- */
const VIEW = { w: 800, h: 500, top: -40, cx: 400, baseY: 335, unit: 350, depth: 265, height: 128, d0: 3.5 };

/**
 * Framing for the current round: centered on the area the fighter covers, zoomed out (k < 1)
 * when a round travels far (dashes, diagonals) so the fighter never leaves the stage.
 */
const FRAME = { cx: 0, cz: 0, k: 1 };

function fitFrame(steps: AnimationStep[]) {
  const xs: number[] = [];
  const zs: number[] = [];
  for (const st of steps) {
    for (const pose of [st.from, st.to]) {
      xs.push(pose.left.x, pose.right.x);
      zs.push(pose.left.z, pose.right.z);
    }
  }
  if (!xs.length) return { cx: 0, cz: 0, k: 1 };
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const k = Math.min(1, 1.8 / (x1 - x0 + 0.4), 1.25 / (z1 - z0 + 0.35));
  return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 - 0.08 / k, k };
}

interface P {
  X: number;
  Y: number;
  /** Size scale at this depth (includes the frame zoom). */
  s: number;
}
const project = (x: number, y: number, z: number): P => {
  const k = FRAME.k;
  const X0 = (x - FRAME.cx) * k;
  const Z0 = (z - FRAME.cz) * k;
  const s = VIEW.d0 / (VIEW.d0 + Z0);
  return { X: VIEW.cx + X0 * VIEW.unit * s, Y: VIEW.baseY - Z0 * VIEW.depth - y * k * VIEW.height * s, s: s * k };
};
const pt = (p: P) => `${p.X.toFixed(1)},${p.Y.toFixed(1)}`;

interface V3 {
  x: number;
  y: number;
  z: number;
}
const add = (a: V3, b: V3, k = 1): V3 => ({ x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k });
const lerp3 = (a: V3, b: V3, t: number): V3 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });

/* Toe direction for a foot angle (deg, CCW from above, 0 = forward). */
const dirOf = (deg: number) => {
  const r = (deg * Math.PI) / 180;
  return { x: -Math.sin(r), y: 0, z: Math.cos(r) };
};

/** Tapered capsule between two 3D points (widths in meters), as an SVG path. */
function capsule(a: V3, b: V3, wa: number, wb: number): string {
  const pa = project(a.x, a.y, a.z);
  const pb = project(b.x, b.y, b.z);
  const ra = (wa * VIEW.unit * pa.s) / 2;
  const rb = (wb * VIEW.unit * pb.s) / 2;
  const len = Math.hypot(pb.X - pa.X, pb.Y - pa.Y) || 1e-6;
  const nx = -(pb.Y - pa.Y) / len;
  const ny = (pb.X - pa.X) / len;
  const f = (v: number) => v.toFixed(1);
  return [
    `M${f(pa.X + nx * ra)},${f(pa.Y + ny * ra)}`,
    `L${f(pb.X + nx * rb)},${f(pb.Y + ny * rb)}`,
    `A${f(rb)},${f(rb)} 0 0 1 ${f(pb.X - nx * rb)},${f(pb.Y - ny * rb)}`,
    `L${f(pa.X - nx * ra)},${f(pa.Y - ny * ra)}`,
    `A${f(ra)},${f(ra)} 0 0 1 ${f(pa.X + nx * ra)},${f(pa.Y + ny * ra)}`,
    'Z',
  ].join(' ');
}

/* ---------- Fighter ---------- */
function Fighter({ pose, moving }: { pose: DemoPose; moving: 'left' | 'right' | null }) {
  const yaw = (pose.yaw * Math.PI) / 180;
  const right: V3 = { x: Math.cos(yaw), y: 0, z: Math.sin(yaw) };
  const facing: V3 = { x: -Math.sin(yaw), y: 0, z: Math.cos(yaw) };
  const up: V3 = { x: 0, y: 1, z: 0 };

  const foot = (f: FootPose) => ({ x: f.x, y: f.lift, z: f.z });
  const mx = (pose.left.x + pose.right.x) / 2;
  const mz = (pose.left.z + pose.right.z) / 2;
  // Knees bent, slight forward lean: an athletic fighting stance.
  const hipC: V3 = { x: mx, y: 0.86 + pose.bob, z: mz - 0.02 };
  const shC = add(add(hipC, up, 0.5), facing, 0.06);
  const neck = add(shC, up, 0.06);
  const head = add(add(shC, up, 0.19), facing, 0.03);

  const legs = (['left', 'right'] as const).map((side) => {
    const sign = side === 'left' ? -1 : 1;
    const f = pose[side];
    const ankle = add(foot(f), up, 0.07);
    const hip = add(hipC, right, 0.1 * sign);
    const knee = add(add(lerp3(hip, ankle, 0.5), facing, 0.09 + f.lift * 0.6), right, 0.035 * sign);
    knee.y += f.lift * 0.8;
    const thighMid = lerp3(hip, knee, 0.55);
    const d = dirOf(f.angle);
    const heel = add(foot(f), d, -0.06);
    const toe = add(foot(f), d, 0.17);
    return { side, f, hip, knee, ankle, thighMid, heel, toe };
  });
  // Painter's order: the leg further from the viewer is drawn first.
  legs.sort((a, b) => b.f.z - a.f.z);

  const arms = (['left', 'right'] as const).map((side) => {
    const sign = side === 'left' ? -1 : 1;
    const sh = add(shC, right, 0.19 * sign);
    // Tight guard: elbows tucked, gloves just in front of the chin.
    const guardElbow = add(add(add(sh, up, -0.21), facing, 0.07), right, -0.03 * sign);
    const guardGlove = add(add(add(sh, up, 0.02), facing, 0.17), right, -0.08 * sign);
    // Punch: the arm straightens toward the camera along the centerline.
    const ext = pose.punch[side];
    const outElbow = add(add(sh, facing, 0.3), right, -0.04 * sign);
    const outGlove = add(add(add(sh, facing, 0.62), up, 0.03), right, -0.09 * sign);
    return { side, sh, elbow: lerp3(guardElbow, outElbow, ext), glove: lerp3(guardGlove, outGlove, ext), punching: ext > 0.05 };
  });

  const circle = (c: V3, r: number, className: string) => {
    const p = project(c.x, c.y, c.z);
    return <circle className={className} cx={p.X} cy={p.Y} r={r * VIEW.unit * p.s} />;
  };
  const poly = (pts: V3[]) => pts.map((p) => pt(project(p.x, p.y, p.z))).join(' ');
  const waist = [add(hipC, right, -0.15), add(hipC, right, 0.15)];
  const chest = [add(shC, right, -0.17), add(shC, right, 0.17)];

  return (
    <g className="fighter">
      {legs.map((l) => {
        const sp = project(l.f.x, 0, l.f.z);
        return (
          <ellipse
            key={l.side}
            className="fighter-shadow"
            cx={sp.X}
            cy={sp.Y}
            rx={0.16 * VIEW.unit * sp.s}
            ry={0.07 * VIEW.unit * sp.s}
          />
        );
      })}

      {/* Arms are in front of the body (further from the viewer): drawn first. */}
      {arms.map((a) => (
        <g key={a.side}>
          <path className="fighter-skin" d={capsule(a.sh, a.elbow, 0.075, 0.065)} />
          <path className="fighter-skin" d={capsule(a.elbow, a.glove, 0.065, 0.06)} />
          {circle(a.glove, 0.06, `fighter-glove ${a.punching ? 'is-moving' : ''}`)}
        </g>
      ))}

      {legs.map((l) => (
        <g key={l.side}>
          <path className="fighter-skin" d={capsule(l.knee, l.ankle, 0.08, 0.055)} />
          <path className="fighter-skin" d={capsule(l.thighMid, l.knee, 0.1, 0.085)} />
          <path className="fighter-shorts" d={capsule(l.hip, l.thighMid, 0.15, 0.13)} />
        </g>
      ))}

      <polygon className="fighter-shorts" points={poly([waist[0], waist[1], add(waist[1], up, -0.1), add(waist[0], up, -0.1)])} />
      <polygon className="fighter-top" points={poly([chest[0], chest[1], waist[1], waist[0]])} />
      <polyline className="fighter-waistband" points={poly(waist)} />
      <path className="fighter-skin" d={capsule(neck, shC, 0.08, 0.1)} />
      {circle(head, 0.095, 'fighter-skin')}

      {/* Feet drawn last: they are the primary information and must never be hidden. */}
      {legs.map((l) => (
        <path key={l.side} className={`fighter-shoe ${moving === l.side ? 'is-moving' : ''}`} d={capsule(l.heel, l.toe, 0.09, 0.08)} />
      ))}
    </g>
  );
}

/* ---------- Floor + guides ---------- */
function Floor() {
  const lines: React.ReactNode[] = [];
  // World-aligned grid (one cell = one step) around the current framing.
  const G = 0.35;
  const { cx, cz, k } = FRAME;
  const [xa, xb] = [cx - 1.3 / k, cx + 1.3 / k];
  const [za, zb] = [cz - 0.62 / k, cz + 1.05 / k];
  for (let x = Math.ceil(xa / G) * G; x <= xb; x += G) {
    const a = project(x, 0, za);
    const b = project(x, 0, zb);
    lines.push(<line key={`x${x.toFixed(2)}`} x1={a.X} y1={a.Y} x2={b.X} y2={b.Y} />);
  }
  for (let z = Math.ceil(za / G) * G; z <= zb; z += G) {
    const a = project(xa, 0, z);
    const b = project(xb, 0, z);
    lines.push(<line key={`z${z.toFixed(2)}`} x1={a.X} y1={a.Y} x2={b.X} y2={b.Y} />);
  }
  const cam = { X: VIEW.cx, Y: VIEW.top + 26 };
  // The mat under one overhead light.
  const corners = [project(xa, 0, za), project(xb, 0, za), project(xb, 0, zb), project(xa, 0, zb)];
  const origin = project(0.02, 0, 0);
  const tape = 14 * origin.s;
  return (
    <g>
      <polygon className="demo-mat" points={corners.map((p) => `${p.X},${p.Y}`).join(' ')} fill="url(#demo-spot)" mask="url(#demo-fade)" />
      <g className="demo-tape">
        <line x1={origin.X - tape} y1={origin.Y} x2={origin.X + tape} y2={origin.Y} />
        <line x1={origin.X} y1={origin.Y - tape * 0.6} x2={origin.X} y2={origin.Y + tape * 0.6} />
      </g>
      <g className="demo-floor" mask="url(#demo-fade)">
        {lines}
      </g>
      <g className="demo-camera">
        <rect x={cam.X - 13} y={cam.Y - 20} width={26} height={14} rx={3} />
        <text x={cam.X} y={cam.Y + 6}>CAMERA</text>
      </g>
    </g>
  );
}

function FootMarker({ f, className }: { f: FootPose; className: string }) {
  const d = dirOf(f.angle);
  const a = project(f.x - d.x * 0.07, 0, f.z - d.z * 0.07);
  const b = project(f.x + d.x * 0.17, 0, f.z + d.z * 0.17);
  return <line className={className} x1={a.X} y1={a.Y} x2={b.X} y2={b.Y} strokeWidth={0.11 * VIEW.unit * a.s} />;
}

/** Start/end markers, direction arrow, foot trail and rotation arc for the current step. */
function Guides({ step, sample }: { step: AnimationStep; sample: DemoSample }) {
  const p = sample.phase === 'move' ? sample.progress : 1;
  const reveal = easeInOut(Math.min(1, p / 0.6));
  const center = (q: DemoPose) => ({ x: (q.left.x + q.right.x) / 2, z: (q.left.z + q.right.z) / 2 });
  const moving = step.movingFoot;

  if (step.pivotFoot) {
    const piv = step.from[step.pivotFoot];
    const sw = step.from[moving];
    const total = step.to.yaw - step.from.yaw;
    const pts: string[] = [];
    const n = 24;
    for (let i = 0; i <= n; i++) {
      const r = rotateAround(sw.x, sw.z, piv.x, piv.z, total * (i / n) * reveal);
      pts.push(pt(project(r.x, 0, r.z)));
    }
    const end = rotateAround(sw.x, sw.z, piv.x, piv.z, total * reveal);
    const prev = rotateAround(sw.x, sw.z, piv.x, piv.z, total * Math.max(0, reveal - 0.06));
    return (
      <g>
        <FootMarker f={step.from[moving]} className="demo-marker-start" />
        <FootMarker f={step.to[moving]} className="demo-marker-end" />
        <polyline className="demo-arrow" points={pts.join(' ')} />
        <Arrowhead from={project(prev.x, 0, prev.z)} to={project(end.x, 0, end.z)} />
        <circle className="demo-pivot" {...(() => { const c = project(piv.x, 0, piv.z); return { cx: c.X, cy: c.Y, r: 6 * c.s }; })()} />
      </g>
    );
  }

  const a = center(step.from);
  const b = center(step.to);
  const tip = { x: a.x + (b.x - a.x) * reveal, z: a.z + (b.z - a.z) * reveal };
  const pa = project(a.x, 0, a.z);
  const pb = project(tip.x, 0, tip.z);
  const second = moving === 'left' ? 'right' : 'left';
  const trailFrom = project(step.from[moving].x, 0, step.from[moving].z);
  const trailTo = project(sample.pose[moving].x, 0, sample.pose[moving].z);
  return (
    <g>
      <FootMarker f={step.from[moving]} className="demo-marker-start" />
      <FootMarker f={step.from[second]} className="demo-marker-start" />
      <FootMarker f={step.to[moving]} className="demo-marker-end" />
      <FootMarker f={step.to[second]} className="demo-marker-end" />
      <line className="demo-trail" x1={trailFrom.X} y1={trailFrom.Y} x2={trailTo.X} y2={trailTo.Y} />
      {reveal > 0.05 && (
        <>
          <line className="demo-arrow" x1={pa.X} y1={pa.Y} x2={pb.X} y2={pb.Y} />
          <Arrowhead from={pa} to={pb} />
        </>
      )}
    </g>
  );
}

function Arrowhead({ from, to }: { from: P; to: P }) {
  const ang = Math.atan2(to.Y - from.Y, to.X - from.X);
  const L = 16;
  const w = 0.55;
  const p1 = { X: to.X - L * Math.cos(ang - w), Y: to.Y - L * Math.sin(ang - w) };
  const p2 = { X: to.X - L * Math.cos(ang + w), Y: to.Y - L * Math.sin(ang + w) };
  return <polyline className="demo-arrow" points={`${p1.X},${p1.Y} ${to.X},${to.Y} ${p2.X},${p2.Y}`} />;
}

/* ---------- Public component ---------- */
interface Props {
  combination: MovementId[];
  stance: Stance;
  /** Change to replay from the start. */
  playId: number;
  onStepChange?: (index: number) => void;
  onFinished?: () => void;
}

/** Animated footwork demonstration. Pure presentation driven by the shared demo timeline. */
export function FootworkDemo({ combination, stance, playId, onStepChange, onFinished }: Props) {
  const timeline = useMemo(() => buildTimeline(combination, stance), [combination, stance]);
  const frame = useMemo(() => fitFrame(timeline.steps), [timeline]);
  Object.assign(FRAME, frame);
  // Portrait screens: fill the stage height and crop the empty sides, so the fighter is bigger.
  const portrait = useMediaQuery('(max-aspect-ratio: 4/5)');
  const [sample, setSample] = useState<DemoSample>(() => sampleTimeline(timeline, 0, stance));
  const cb = useRef({ onStepChange, onFinished });
  cb.current = { onStepChange, onFinished };

  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    let lastIndex = -2;
    const loop = () => {
      const s = sampleTimeline(timeline, performance.now() - start, stance);
      setSample(s);
      if (s.index !== lastIndex) {
        lastIndex = s.index;
        cb.current.onStepChange?.(s.index);
      }
      if (s.phase === 'done') cb.current.onFinished?.();
      else raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [timeline, stance, playId]);

  const step = sample.index >= 0 ? timeline.steps[sample.index] : null;
  const movingFoot = step && !step.arm && sample.phase === 'move' ? step.movingFoot : null;

  return (
    <svg
      className={`demo-svg ${portrait ? 'is-portrait' : ''}`}
      viewBox={`0 ${VIEW.top} ${VIEW.w} ${VIEW.h - VIEW.top}`}
      preserveAspectRatio={portrait ? 'xMidYMid slice' : 'xMidYMid meet'}
      role="img"
      aria-label="Footwork demonstration"
    >
      <defs>
        <radialGradient id="demo-spot" cx="50%" cy="58%" r="50%">
          <stop offset="0%" stopColor="#ece9e3" stopOpacity="0.12" />
          <stop offset="55%" stopColor="#ece9e3" stopOpacity="0.035" />
          <stop offset="85%" stopColor="#ece9e3" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="fighter-skin" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ded8ce" />
          <stop offset="100%" stopColor="#9f988e" />
        </linearGradient>
        <linearGradient id="fighter-kit" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#383840" />
          <stop offset="100%" stopColor="#18181d" />
        </linearGradient>
        <radialGradient id="fighter-glove" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#c9c5bd" />
        </radialGradient>
        <radialGradient id="fighter-glove-live" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ff8a62" />
          <stop offset="100%" stopColor="#e23a10" />
        </radialGradient>
        <radialGradient id="demo-fade-g" cx="50%" cy="55%" r="60%">
          <stop offset="0%" stopColor="#fff" stopOpacity="1" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id="demo-fade">
          <rect y={VIEW.top} width={VIEW.w} height={VIEW.h - VIEW.top} fill="url(#demo-fade-g)" />
        </mask>
      </defs>
      <Floor />
      {step && !step.arm && sample.phase !== 'done' && <Guides step={step} sample={sample} />}
      <Fighter pose={sample.pose} moving={movingFoot} />
    </svg>
  );
}
