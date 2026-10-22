import './RepDial.css';

interface Props {
  reps: number;
  caption: string;
  /** The ring is filled from analysis code every frame (strokeDashoffset 100 → 0), no React render. */
  fillRef: React.RefObject<SVGCircleElement | null>;
}

/** The rep count inside a ring that fills as the body goes through the movement. */
export function RepDial({ reps, caption, fillRef }: Props) {
  return (
    <div className="rep-dial">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="rep-ring-track" cx="50" cy="50" r="46" />
        <circle ref={fillRef} className="rep-ring-fill" cx="50" cy="50" r="46" pathLength={100} />
      </svg>
      <div className="rep-dial-center">
        <strong className="rep-number" key={reps}>
          {reps}
        </strong>
        <span className="label">{caption}</span>
      </div>
    </div>
  );
}

/** Fill the ring to `progress` (0..1). */
export function setDial(el: SVGCircleElement | null, progress: number) {
  if (el) el.style.strokeDashoffset = String(100 - Math.max(0, Math.min(1, progress)) * 100);
}
