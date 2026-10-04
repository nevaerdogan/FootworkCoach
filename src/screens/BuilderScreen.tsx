import { useState } from 'react';
import { Icon } from '../components/Icon';
import { MOVEMENT_LIST, MOVEMENTS, type MovementId } from '../movements';
import { isValidCombination } from '../training/combinations';
import './pages.css';

const MAX_MOVES = 8;

interface Props {
  onBack: () => void;
  onContinue: (combination: MovementId[]) => void;
}

/** Build your round. Moves that would break the round rules (repeat, leaving the frame) are disabled. */
export function BuilderScreen({ onBack, onContinue }: Props) {
  const [seq, setSeq] = useState<MovementId[]>([]);
  const canAdd = (id: MovementId) => seq.length < MAX_MOVES && isValidCombination([...seq, id]);

  return (
    <main className="screen page">
      <header className="page-top">
        <button className="btn btn-ghost" onClick={onBack} aria-label="Back">
          <Icon name="arrowLeft" />
        </button>
        <span className="label">Build your round</span>
      </header>

      <section className="page-body builder">
        <div>
          <h2 className="label builder-heading">Moves</h2>
          <div className="builder-moves">
            {MOVEMENT_LIST.filter((m) => m.kind !== 'rhythm').map((m) => (
              <button key={m.id} className="move-tile" disabled={!canAdd(m.id)} onClick={() => setSeq([...seq, m.id])}>
                <Icon name={m.icon} className="move-tile-icon" />
                <span>{m.label}</span>
                <Icon name="plus" className="move-tile-plus" />
              </button>
            ))}
          </div>
          <p className="muted builder-hint">
            Moves that would repeat or take you out of the camera frame are unavailable.
          </p>
        </div>

        <div>
          <h2 className="label builder-heading">
            Your sequence <span className="muted">{seq.length}/{MAX_MOVES}</span>
          </h2>
          {seq.length === 0 ? (
            <p className="builder-empty muted">Add moves to build your round.</p>
          ) : (
            <ol className="builder-seq">
              {seq.map((id, i) => (
                <li key={i}>
                  <span className="builder-num">{String(i + 1).padStart(2, '0')}</span>
                  <Icon name={MOVEMENTS[id].icon} />
                  <span className="builder-name">{MOVEMENTS[id].label}</span>
                  {i === seq.length - 1 && (
                    <button className="builder-remove" onClick={() => setSeq(seq.slice(0, -1))} aria-label="Remove last move">
                      <Icon name="close" />
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      <footer className="page-bottom">
        <button className="btn btn-ghost" onClick={() => setSeq([])} disabled={seq.length === 0}>
          Clear
        </button>
        <button className="btn btn-primary" disabled={seq.length < 2} onClick={() => onContinue(seq)}>
          Continue <Icon name="arrowRight" />
        </button>
      </footer>
    </main>
  );
}
