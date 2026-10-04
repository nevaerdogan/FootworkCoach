import { useEffect, useRef, useState } from 'react';
import { usePoseFrames } from '../components/CameraView';
import { CALIBRATION_CONFIG, TRAINING_CONFIG } from '../config';
import { BaselineCollector, type BaselineState } from '../footwork/baseline';

type View = 'NOT_VISIBLE' | 'HOLD' | 'MOVED' | 'DONE';

const leadLabel = TRAINING_CONFIG.stance === 'orthodox' ? 'left' : 'right';

const COPY: Record<View, { title: string; body: string }> = {
  NOT_VISIBLE: { title: 'Feet not clearly visible', body: 'Step back so both feet stay inside the frame.' },
  HOLD: { title: 'Fighting stance', body: `Get in your ${TRAINING_CONFIG.stance} stance — ${leadLabel} foot forward. Hold still.` },
  MOVED: { title: 'Hold still', body: 'Keep your feet planted while we lock your stance.' },
  DONE: { title: 'Stance locked', body: 'Stay in position — starting now.' },
};

interface Props {
  onCaptured: (baseline: BaselineState) => void;
  onDone: () => void;
}

export function CalibrationStage({ onCaptured, onDone }: Props) {
  const collector = useRef(new BaselineCollector()).current;
  const [view, setView] = useState<View>('HOLD');
  const viewRef = useRef<View>('HOLD');
  const barRef = useRef<HTMLDivElement>(null);
  const onCapturedRef = useRef(onCaptured);
  onCapturedRef.current = onCaptured;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  usePoseFrames((frame) => {
    if (viewRef.current === 'DONE') return;
    const s = collector.push(frame);
    // Progress is written straight to the DOM: no React render per frame.
    if (barRef.current) barRef.current.style.transform = `scaleX(${s.progress})`;

    let next: View;
    if (s.phase === 'done') next = 'DONE';
    else if (s.phase === 'waiting') next = 'NOT_VISIBLE';
    // Keep "Hold still" up briefly after a restart so the message doesn't flicker.
    else if (s.reason === 'MOVED' || (viewRef.current === 'MOVED' && s.progress < 0.25)) next = 'MOVED';
    else next = 'HOLD';
    if (next !== viewRef.current) {
      viewRef.current = next;
      setView(next);
    }
    if (s.phase === 'done') onCapturedRef.current(s.baseline);
  });

  const copy = COPY[view];
  const done = view === 'DONE';

  // Hands-free: the user is in stance, away from the keyboard.
  useEffect(() => {
    if (!done) return;
    const id = setTimeout(() => onDoneRef.current(), CALIBRATION_CONFIG.lockedHoldMs);
    return () => clearTimeout(id);
  }, [done]);

  return (
    <footer className="session-bottom">
      <div className="session-guidance" key={view}>
        <h2 className="h2">{copy.title}</h2>
        <p className="muted">{copy.body}</p>
        <div className={`calib-track ${done ? 'is-done' : ''}`} aria-hidden="true">
          <div ref={barRef} className="calib-bar" style={done ? { transform: 'scaleX(1)' } : undefined} />
        </div>
      </div>

    </footer>
  );
}
