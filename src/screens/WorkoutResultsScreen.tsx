import { useMemo } from 'react';
import { Icon } from '../components/Icon';
import { Stinger } from '../components/Stinger';
import { useCountUp } from '../components/useCountUp';
import { MOVEMENTS } from '../movements';
import { scoreWorkout } from '../training/workoutScoring';
import type { WorkoutResult } from '../training/WorkoutSession';
import './pages.css';

interface Props {
  result: WorkoutResult;
  previousScore?: number | null;
  onTrainAgain: () => void;
  onNewWorkout: () => void;
  onHome: () => void;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function WorkoutResultsScreen({ result, previousScore, onTrainAgain, onNewWorkout, onHome }: Props) {
  const score = useMemo(() => scoreWorkout(result), [result]);
  const delta = previousScore == null ? null : score.overall - previousScore;
  const shown = useCountUp(score.overall, 1300, 700);
  const maxTempo = Math.max(1, ...score.rounds.map((r) => r.tempo));

  return (
    <main className="screen page results-page">
      <Stinger play={1} title={result.endedEarly ? 'Workout ended' : 'Workout complete'} kicker={result.workout.name} />
      <header className="page-top">
        <button className="btn btn-ghost" onClick={onHome} aria-label="Home">
          <Icon name="arrowLeft" />
        </button>
        <span className="label">{result.endedEarly ? 'Workout ended' : 'Workout complete'} · {result.workout.name}</span>
      </header>

      <section className="page-body results">
        <div className="results-hero">
          <span className="display results-score reveal">
            {shown}
            <span className="results-pct">%</span>
          </span>
          <span className="label">
            Workout score
            {delta !== null && (
              <span className={`results-delta ${delta >= 0 ? 'is-up' : 'is-down'}`}>
                {delta >= 0 ? '+' : '−'}
                {Math.abs(delta)} vs last time
              </span>
            )}
          </span>
          <dl className="wr-stats reveal">
            <div>
              <dt className="label">Reps</dt>
              <dd>{score.reps}</dd>
            </div>
            <div>
              <dt className="label">Accuracy</dt>
              <dd>{pct(score.components.accuracy)}</dd>
            </div>
            <div>
              <dt className="label">Tempo</dt>
              <dd>
                {Math.round(score.tempo)}
                <small>/min</small>
              </dd>
            </div>
            <div>
              <dt className="label">Rhythm</dt>
              <dd>{pct(score.components.rhythm)}</dd>
            </div>
            <div>
              <dt className="label">Work</dt>
              <dd>{mmss(score.workSeconds)}</dd>
            </div>
          </dl>
        </div>

        <div className="results-detail-col">
          <h2 className="label wr-heading">Rounds</h2>
          <ol className="results-list wr-list">
            {score.rounds.map((r, i) => (
              <li key={r.round} className="is-correct" style={{ animationDelay: `${120 + i * 70}ms` }}>
                <span className="builder-num">{String(r.round + 1).padStart(2, '0')}</span>
                <span className="results-name">
                  {r.reps} reps
                  <span className="results-status">
                    {pct(r.accuracy)} accurate · rhythm {pct(r.rhythm)}
                  </span>
                </span>
                <span className="results-bar" aria-hidden="true">
                  <i style={{ transform: `scaleX(${r.tempo / maxTempo})` }} />
                </span>
                <span className="results-pctval">{Math.round(r.tempo)}/m</span>
              </li>
            ))}
          </ol>

          {score.blocks.length > 1 && (
            <>
              <h2 className="label wr-heading">Drills</h2>
              <ol className="results-list wr-list">
                {score.blocks.map((b, i) => (
                  <li key={b.name} className={b.accuracy >= 0.7 ? 'is-correct' : 'is-wrong'} style={{ animationDelay: `${300 + i * 70}ms` }}>
                    <span className="builder-num">{String(i + 1).padStart(2, '0')}</span>
                    <span className="results-name">
                      {b.name}
                      <span className="results-status">
                        {b.reps} reps · {Math.round(b.tempo)}/min (target {b.targetPerMin})
                      </span>
                    </span>
                    <span className="results-bar" aria-hidden="true">
                      <i style={{ transform: `scaleX(${b.accuracy})` }} />
                    </span>
                    <span className="results-pctval">{pct(b.accuracy)}</span>
                  </li>
                ))}
              </ol>
            </>
          )}

          {score.moves.length > 0 && (
            <p className="wr-moves muted">
              {score.moves.map((m) => `${MOVEMENTS[m.id].short} ${pct(m.accuracy)}`).join(' · ')}
            </p>
          )}

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
        <button className="btn btn-ghost" onClick={onNewWorkout}>
          Choose workout
        </button>
        <button className="btn btn-primary" onClick={onTrainAgain}>
          <Icon name="refresh" /> Train again
        </button>
      </footer>
    </main>
  );
}
