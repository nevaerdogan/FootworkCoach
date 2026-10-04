import { useEffect, useState } from 'react';
import { BrandMark } from './BrandMark';
import { Glove } from './Glove';
import './Intro.css';

const DURATION = 2900;

/**
 * Opening sequence on page load: ring ropes draw across, two gloves touch at the centre,
 * the brand appears, then the ring splits open onto the app. Click or any key skips it.
 */
export function Intro({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onDone();
    };
    const leave = setTimeout(() => setLeaving(true), DURATION - 550);
    const end = setTimeout(finish, DURATION);
    const skip = () => {
      setLeaving(true);
      setTimeout(finish, 420);
    };
    window.addEventListener('keydown', skip, { once: true });
    window.addEventListener('pointerdown', skip, { once: true });
    return () => {
      clearTimeout(leave);
      clearTimeout(end);
      window.removeEventListener('keydown', skip);
      window.removeEventListener('pointerdown', skip);
    };
  }, [onDone]);

  return (
    <div className={`intro ${leaving ? 'is-leaving' : ''}`} aria-hidden="true">
      <div className="intro-half intro-top" />
      <div className="intro-half intro-bottom" />

      <svg className="intro-ropes" viewBox="0 0 100 100" preserveAspectRatio="none">
        <line x1="0" y1="34" x2="100" y2="34" pathLength={100} />
        <line x1="0" y1="50" x2="100" y2="50" pathLength={100} />
        <line x1="0" y1="66" x2="100" y2="66" pathLength={100} />
      </svg>

      <div className="intro-gloves">
        <Glove tone="accent" className="intro-glove intro-glove-left" />
        <i className="intro-flash" />
        <Glove tone="chalk" className="intro-glove intro-glove-right" />
      </div>

      <div className="intro-brand">
        <BrandMark size={44} />
        <span className="intro-name">
          <span className="display">Footwork Coach</span>
          <span className="label">Kickboxing footwork, measured</span>
        </span>
      </div>
    </div>
  );
}
