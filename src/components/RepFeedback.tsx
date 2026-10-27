import { useCallback, useEffect, useRef, useState } from 'react';
import type { RepUpdate, Tracking } from '../reps/createCounter';

/** Hide brief tracking dropouts; only warn when tracking is lost for this long. */
const WARN_MS = 400;
/** How long a coaching hint stays on screen. */
const HINT_MS = 1600;

export interface RepWarning {
  tracking: Tracking;
  text: string;
}
export interface RepHint {
  text: string;
  key: number;
}

/**
 * Tracking warnings and short-lived coaching hints for the rep stages. `track` runs in the frame
 * loop and only touches React state when something visible changes; warnings are debounced so a
 * single dropped frame never flashes a message.
 */
export function useRepFeedback() {
  const [warning, setWarning] = useState<RepWarning | null>(null);
  const [hint, setHint] = useState<RepHint | null>(null);
  const lostSince = useRef<number | null>(null);
  const shown = useRef<Tracking>('ok');
  const timer = useRef(0);

  useEffect(() => () => clearTimeout(timer.current), []);

  const track = useCallback((u: RepUpdate, now: number) => {
    if (u.tracking !== 'ok') lostSince.current ??= now;
    else lostSince.current = null;
    const warn: Tracking = lostSince.current !== null && now - lostSince.current > WARN_MS ? u.tracking : 'ok';
    if (warn !== shown.current) {
      shown.current = warn;
      setWarning(warn === 'ok' ? null : { tracking: warn, text: warn === 'lost' ? "Can't see you" : (u.hint ?? 'Get into position') });
    }
    if (u.hint && u.tracking === 'ok') {
      setHint({ text: u.hint, key: now });
      clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setHint(null), HINT_MS);
    }
  }, []);

  /** Clear everything (a new block starts). */
  const reset = useCallback(() => {
    lostSince.current = null;
    shown.current = 'ok';
    setWarning(null);
    clearTimeout(timer.current);
    setHint(null);
  }, []);

  return { warning, hint, track, reset };
}

interface ToastProps {
  warning: RepWarning | null;
  hint: RepHint | null;
  /** Label over a "can't see you" warning: "Paused" when the clock stops, "Keep going" when it doesn't. */
  lostLabel: string;
  /** What to show when there is nothing to say. */
  idle?: React.ReactNode;
}

/** The slot under the rep dial: a tracking warning beats a hint, which beats the idle content. */
export function RepFeedbackToast({ warning, hint, lostLabel, idle = null }: ToastProps) {
  if (warning) {
    return (
      <div className="training-toast reveal" key={warning.tracking}>
        <span className="label">{warning.tracking === 'lost' ? lostLabel : 'Position'}</span>
        <strong className="h2">{warning.text}</strong>
      </div>
    );
  }
  if (hint) {
    return (
      <div className="training-toast is-wrong" key={hint.key}>
        <strong className="h2">{hint.text}</strong>
      </div>
    );
  }
  return idle;
}
