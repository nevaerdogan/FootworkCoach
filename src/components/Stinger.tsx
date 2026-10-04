import { useEffect, useState } from 'react';
import { BrandMark } from './BrandMark';
import './Stinger.css';

interface Props {
  /** Change this value to play the stinger again. */
  play: string | number | null;
  title: string;
  kicker?: string;
}

/**
 * Fight-broadcast stinger: angled bands sweep across the screen with a title between them.
 * Purely decorative (pointer-events: none) and removed from the DOM when finished.
 */
export function Stinger({ play, title, kicker }: Props) {
  const [run, setRun] = useState<{ key: string | number; title: string; kicker?: string } | null>(null);

  useEffect(() => {
    if (play === null) return;
    setRun({ key: play, title, kicker });
    const id = setTimeout(() => setRun(null), 1500);
    return () => clearTimeout(id);
    // Only replay when `play` changes.
  }, [play]);

  if (!run) return null;
  return (
    <div className="stinger" key={run.key} aria-hidden="true">
      <i className="stinger-band stinger-band-a" />
      <i className="stinger-band stinger-band-b" />
      <i className="stinger-band stinger-band-c" />
      <div className="stinger-title">
        <BrandMark size={34} />
        <span className="stinger-text">
          {run.kicker && <span className="label stinger-kicker">{run.kicker}</span>}
          <strong className="display">{run.title}</strong>
        </span>
      </div>
    </div>
  );
}
