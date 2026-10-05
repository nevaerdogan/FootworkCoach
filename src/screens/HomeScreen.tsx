import { useCallback, useEffect, useRef, useState } from 'react';
import { BrandMark } from '../components/BrandMark';
import { FootworkDiagram } from '../components/FootworkDiagram';
import { Icon } from '../components/Icon';
import { Stinger } from '../components/Stinger';
import { MOVEMENTS } from '../movements';
import { DRILLS } from '../training/combinations';
import type { SessionRecord } from '../training/history';
import './HomeScreen.css';

interface Props {
  history: SessionRecord[];
  onStart: () => void;
  onCustom: () => void;
  onPractice: () => void;
}

/** Drills the hero diagram cycles through. */
const SHOWCASE = ['box', 'diamond', 'l-step', 'in-out'].map((id) => DRILLS.find((d) => d.id === id)!);
const STEP_MS = 850;
/** Easter egg: this many quick taps on the logo reveal the signature. */
const SIGNATURE_TAPS = 5;
const TAP_GAP_MS = 600;

function timeAgo(iso: string, now = Date.now()): string {
  const min = Math.round((now - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

export function HomeScreen({ history, onStart, onCustom, onPractice }: Props) {
  const last = history[0];
  const recent = history.slice(0, 8).reverse();
  const [drillIndex, setDrillIndex] = useState(0);
  const [step, setStep] = useState(-1);
  const drill = SHOWCASE[drillIndex];

  // Next drill after the diagram has shown every step and held for a moment.
  useEffect(() => {
    const id = setTimeout(() => setDrillIndex((i) => (i + 1) % SHOWCASE.length), (drill.moves.length + 2.5) * STEP_MS);
    return () => clearTimeout(id);
  }, [drill]);
  const onStep = useCallback((i: number) => setStep(i), []);

  // The mat leans toward the pointer and its light follows it (CSS variables, no re-render).
  const matRef = useRef<HTMLElement>(null);
  const onMatMove = (e: React.PointerEvent) => {
    const el = matRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
    el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
    el.style.setProperty('--rx', `${((0.5 - y) * 6).toFixed(2)}deg`);
    el.style.setProperty('--ry', `${((x - 0.5) * 8).toFixed(2)}deg`);
  };
  // Tapping the logo makes it twitch; enough taps in a row play the signature stinger.
  const [taps, setTaps] = useState(0);
  const [signature, setSignature] = useState<number | null>(null);
  const lastTap = useRef(0);
  const onBrandTap = () => {
    const now = Date.now();
    const count = now - lastTap.current < TAP_GAP_MS ? taps + 1 : 1;
    lastTap.current = now;
    if (count >= SIGNATURE_TAPS) {
      setTaps(0);
      setSignature(now);
      navigator.vibrate?.(30);
    } else setTaps(count);
  };

  const onMatLeave = () => {
    const el = matRef.current;
    if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  };

  return (
    <main className="screen home">
      <Stinger play={signature} title="nevamindd" kicker="In the red corner" keepCase />
      <header className="home-top">
        <span className="home-brand" onClick={onBrandTap}>
          <span
            className={taps ? 'home-brand-mark is-tapped' : 'home-brand-mark'}
            key={taps}
            style={{ '--tap': taps } as React.CSSProperties}
          >
            <BrandMark />
          </span>
          <span className="label">Footwork Coach</span>
        </span>
        <button className="label home-link" onClick={onPractice}>
          Free practice
        </button>
      </header>

      <section className="home-hero">
        <div className="home-copy">
          <span className="label home-eyebrow">Kickboxing footwork, measured</span>
          <h1 className="display home-title reveal-lines">
            <span>
              <span>Train your</span>
            </span>
            <span>
              <span>
                footwork<span className="home-dot">.</span>
              </span>
            </span>
          </h1>
          <p className="home-lead">
            Watch the drill, do it in front of your camera, and see exactly what it measured: direction, distance,
            timing and rhythm.
          </p>
          <div className="home-actions">
            <button className="btn btn-primary" onClick={onStart}>
              Start training <Icon name="arrowRight" />
            </button>
            <button className="btn btn-ghost" onClick={onCustom}>
              Build your own
            </button>
          </div>

          {last && (
            <div className="home-recent" aria-label="Last session">
              <span className="label">Last session</span>
              <span className="home-recent-row">
                <strong className="mono home-recent-score">{last.overallScore}%</strong>
                <span className="muted">
                  {last.workoutName ?? `${last.combination.length}-move round`} · {timeAgo(last.date)}
                </span>
              </span>
              {recent.length > 1 && (
                <span className="home-spark" aria-hidden="true">
                  {recent.map((r, i) => (
                    <i key={i} style={{ height: `${Math.max(8, r.overallScore)}%` }} className={i === recent.length - 1 ? 'is-last' : ''} />
                  ))}
                </span>
              )}
            </div>
          )}
        </div>

        <figure className="home-mat" aria-label="Drill diagram" ref={matRef} onPointerMove={onMatMove} onPointerLeave={onMatLeave}>
          <i className="home-mat-light" aria-hidden="true" />
          <div className="home-mat-head">
            <span className="label">Drill</span>
            <span className="label home-mat-count mono">
              {String(Math.max(0, step + 1)).padStart(2, '0')} / {String(drill.moves.length).padStart(2, '0')}
            </span>
          </div>
          <div className="home-mat-stage">
            <FootworkDiagram key={drill.id} combination={drill.moves} animate stepMs={STEP_MS} onStep={onStep} />
          </div>
          <figcaption className="home-mat-caption">
            <strong className="display home-mat-name" key={drill.id}>
              {drill.name}
            </strong>
            <ol className="home-mat-steps">
              {drill.moves.map((id, i) => (
                <li key={i} className={i === step ? 'is-live' : i < step ? 'is-done' : ''}>
                  {MOVEMENTS[id].short}
                </li>
              ))}
            </ol>
          </figcaption>
        </figure>
      </section>

      <footer className="home-foot">
        <span className="label">Camera video stays on this device</span>
        <span className="label">Orthodox stance</span>
      </footer>
    </main>
  );
}
