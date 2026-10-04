import { useMemo, useState } from 'react';
import { Stinger } from '../components/Stinger';
import { Trajectory } from '../components/Trajectory';
import { useCountUp } from '../components/useCountUp';
import { Icon } from '../components/Icon';
import { MOVEMENTS } from '../movements';
import { scoreSession, type MovementScore } from '../training/scoring';
import type { SessionResult } from '../training/TrainingSession';
import './pages.css';

interface Props {
  result: SessionResult;
  onTrainAgain: () => void;
  onNewRound: () => void;
  onHome: () => void;
  /** Score of the last session with the same combination, if any. */
  previousScore?: number | null;
}

const STATUS_TEXT: Record<MovementScore['status'], string> = {
  correct: '',
  unclear: 'Unclear',
  wrong: 'Wrong move',
  missed: 'Not detected',
};

export function ResultsScreen({ result, onTrainAgain, onNewRound, onHome, previousScore }: Props) {
  const score = useMemo(() => scoreSession(result), [result]);
  const [selected, setSelected] = useState<number | null>(null);
  const delta = previousScore == null ? null : score.overall - previousScore;
  const shown = useCountUp(score.overall, 1300, 700);

  return (
    <main className="screen page results-page">
      <Stinger play={1} title="Session complete" kicker="Footwork round" />
      <header className="page-top">
        <button className="btn btn-ghost" onClick={onHome} aria-label="Home">
          <Icon name="arrowLeft" />
        </button>
        <span className="label">Session complete</span>
      </header>

      <section className="page-body results">
        <div className="results-hero">
          <span className="display results-score reveal">
            {shown}
            <span className="results-pct">%</span>
          </span>
          <span className="label">
            Footwork accuracy
            {delta !== null && (
              <span className={`results-delta ${delta >= 0 ? 'is-up' : 'is-down'}`}>
                {delta >= 0 ? '+' : '−'}
                {Math.abs(delta)} vs last time
              </span>
            )}
          </span>
          <dl className="results-meta reveal">
            <div>
              <dt className="label">Sequence</dt>
              <dd>{score.orderKept ? 'In order' : 'Shifted'}</dd>
            </div>
            <div>
              <dt className="label">Time</dt>
              <dd>{(score.totalTimeMs / 1000).toFixed(1)} s</dd>
            </div>
          </dl>
          <div className="results-traj reveal">
            <Trajectory movements={score.movements} selected={selected} onSelect={setSelected} />
          </div>
        </div>

        <div className="results-detail-col">
          <ol className="results-list">
            {score.movements.map((m, i) => (
              <li
                key={i}
                className={`is-${m.status} ${selected === i ? 'is-selected' : ''}`}
                style={{ animationDelay: `${150 + i * 70}ms` }}
                onMouseEnter={() => setSelected(i)}
                onMouseLeave={() => setSelected(null)}
              >
                <span className="builder-num">{String(i + 1).padStart(2, '0')}</span>
                <Icon name={MOVEMENTS[m.expected].icon} />
                <span className="results-name">
                  {MOVEMENTS[m.expected].label}
                  {m.status !== 'correct' && <span className="results-status">{STATUS_TEXT[m.status]}</span>}
                </span>
                <span className="results-bar" aria-hidden="true">
                  <i style={{ transform: `scaleX(${m.score / 100})`, transitionDelay: `${300 + i * 70}ms` }} />
                </span>
                <span className="results-pctval">{m.score}%</span>
              </li>
            ))}
          </ol>

          {score.feedback.length > 0 && (
            <div className="results-feedback">
              <h2 className="label">What to work on</h2>
              <ul>
                {score.feedback.map((f, i) => (
                  <li key={i} className={`is-${f.tone}`} style={{ animationDelay: `${500 + i * 80}ms` }}>
                    {f.text}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      <footer className="page-bottom">
        <button className="btn btn-ghost" onClick={onNewRound}>
          New round
        </button>
        <button className="btn btn-primary" onClick={onTrainAgain}>
          <Icon name="refresh" /> Train again
        </button>
      </footer>
    </main>
  );
}
