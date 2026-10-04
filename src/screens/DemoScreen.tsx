import { useState } from 'react';
import { FootworkDemo } from '../components/FootworkDemo';
import { Icon } from '../components/Icon';
import { MovementSequence, type SequenceStatus } from '../components/MovementSequence';
import { TRAINING_CONFIG } from '../config';
import { MOVEMENTS, type MovementId } from '../movements';
import './pages.css';

interface Props {
  combination: MovementId[];
  onBack: () => void;
  onReady: () => void;
}

/** Watch → Understand. The animation is the primary instruction; text is secondary. */
export function DemoScreen({ combination, onBack, onReady }: Props) {
  const [playId, setPlayId] = useState(0);
  const [index, setIndex] = useState(-1);
  const [finished, setFinished] = useState(false);

  const replay = () => {
    setFinished(false);
    setIndex(-1);
    setPlayId((n) => n + 1);
  };

  const status: SequenceStatus[] = combination.map((_, i) =>
    finished || i < index ? 'done' : i === index ? 'current' : 'upcoming',
  );
  const current = index >= 0 && !finished ? MOVEMENTS[combination[index]] : null;

  return (
    <main className="screen page demo">
      <header className="page-top">
        <button className="btn btn-ghost" onClick={onBack} aria-label="Back">
          <Icon name="arrowLeft" />
        </button>
        <MovementSequence items={combination} status={status} />
      </header>

      <section className="demo-stage">
        <FootworkDemo
          combination={combination}
          stance={TRAINING_CONFIG.stance}
          playId={playId}
          onStepChange={setIndex}
          onFinished={() => setFinished(true)}
        />
        <div className="demo-caption" key={finished ? 'done' : index}>
          {finished ? (
            <h1 className="display demo-title">Your turn</h1>
          ) : current ? (
            <>
              <span className="label">
                {String(index + 1).padStart(2, '0')} / {String(combination.length).padStart(2, '0')}
              </span>
              <h1 className="display demo-title">
                <Icon name={current.icon} className="demo-title-icon" />
                {current.label}
              </h1>
            </>
          ) : (
            <h1 className="display demo-title muted">Watch</h1>
          )}
        </div>
      </section>

      <footer className="page-bottom">
        {finished ? (
          <>
            <button className="btn btn-ghost" onClick={replay}>
              <Icon name="refresh" /> Watch again
            </button>
            <button className="btn btn-primary reveal" onClick={onReady}>
              I'm ready <Icon name="arrowRight" />
            </button>
          </>
        ) : (
          <button className="btn btn-ghost page-bottom-end" onClick={() => setFinished(true)}>
            Skip
          </button>
        )}
      </footer>
    </main>
  );
}
