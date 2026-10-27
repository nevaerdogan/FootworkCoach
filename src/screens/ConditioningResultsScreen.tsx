import { mmss } from '../format';
import { useMemo } from 'react';
import { Icon } from '../components/Icon';
import { Stinger } from '../components/Stinger';
import { useCountUp } from '../components/useCountUp';
import { EXERCISES } from '../conditioning/exercises';
import { summarizeFree, summarizeInterval, type ConditioningResult } from '../conditioning/summary';
import './pages.css';
import './RepStage.css';

interface Props {
  result: ConditioningResult;
  /** Total reps of the last session with the same plan, if any. */
  previousReps?: number | null;
  onAgain: () => void;
  onChoose: () => void;
  onHome: () => void;
}


export function ConditioningResultsScreen({ result, previousReps, onAgain, onChoose, onHome }: Props) {
  const { timed, free } = useMemo(
    () =>
      result.mode === 'timed'
        ? { timed: summarizeInterval(result.result), free: null }
        : { timed: null, free: summarizeFree(result.result) },
    [result],
  );
  const total = timed ? timed.total : free!.reps;
  const partials = timed ? timed.partials : free!.partials;
  const feedback = timed ? timed.feedback : free!.feedback;
  const shown = useCountUp(total, 1300, 700);
  const delta = previousReps == null ? null : total - previousReps;
  const title = result.mode === 'timed' ? (result.result.endedEarly ? 'Workout ended' : 'Workout complete') : 'Set complete';
  const kicker = result.mode === 'free' ? EXERCISES[result.result.exercise].label : 'Timed conditioning';
  const seconds = timed ? timed.workSeconds : Math.round(free!.durationMs / 1000);
  const pace = timed ? timed.pace : free!.pace;
  const maxReps = timed ? Math.max(1, ...timed.byExercise.map((e) => e.reps)) : 1;

  return (
    <main className="screen page results-page">
      <Stinger play={1} title={title} kicker={kicker} />
      <header className="page-top">
        <button className="btn btn-ghost" onClick={onHome} aria-label="Home">
          <Icon name="arrowLeft" />
        </button>
        <span className="label">
          {title} · {kicker}
        </span>
      </header>

      <section className="page-body results">
        <div className="results-hero">
          <span className="display results-score reveal">
            {shown}
            <span className="results-pct rep-unit">reps</span>
          </span>
          <span className="label">
            {result.mode === 'timed' ? 'Total reps' : `${EXERCISES[result.result.exercise].label} counted`}
            {delta !== null && (
              <span className={`results-delta ${delta >= 0 ? 'is-up' : 'is-down'}`}>
                {delta >= 0 ? '+' : '−'}
                {Math.abs(delta)} vs last time
              </span>
            )}
          </span>
          <dl className="wr-stats reveal">
            <div>
              <dt className="label">{timed ? 'Work' : 'Time'}</dt>
              <dd>{mmss(seconds)}</dd>
            </div>
            <div>
              <dt className="label">Pace</dt>
              <dd>
                {pace === null ? '–' : Math.round(pace)}
                <small>/min</small>
              </dd>
            </div>
            {partials > 0 && (
              <div>
                <dt className="label">Partial</dt>
                <dd>{partials}</dd>
              </div>
            )}
            {timed && timed.rounds.length > 1 && (
              <div>
                <dt className="label">Rounds</dt>
                <dd>{timed.rounds.length}</dd>
              </div>
            )}
            {free && free.consistency !== null && (
              <div>
                <dt className="label">Rhythm</dt>
                <dd>{Math.round(free.consistency * 100)}%</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="results-detail-col">
          {timed && (
            <>
              <h2 className="label wr-heading">Exercises</h2>
              <ol className="results-list wr-list">
                {timed.byExercise.map((e, i) => (
                  <li key={e.id} className="is-correct" style={{ animationDelay: `${120 + i * 70}ms` }}>
                    <span className="builder-num">{String(i + 1).padStart(2, '0')}</span>
                    <span className="results-name">
                      {EXERCISES[e.id].label}
                      <span className="results-status">
                        {e.perRound.length > 1 ? `Rounds: ${e.perRound.join(' · ')} · ` : ''}
                        {Math.round(e.pace)}/min
                        {e.partials > 0 ? ` · ${e.partials} partial` : ''}
                      </span>
                    </span>
                    <span className="results-bar" aria-hidden="true">
                      <i style={{ transform: `scaleX(${e.reps / maxReps})` }} />
                    </span>
                    <span className="results-pctval">{e.reps}</span>
                  </li>
                ))}
              </ol>
              {timed.rounds.length > 1 && (
                <>
                  <h2 className="label wr-heading">Rounds</h2>
                  <ol className="results-list wr-list">
                    {timed.rounds.map((r, i) => (
                      <li key={r.round} className="is-correct" style={{ animationDelay: `${300 + i * 70}ms` }}>
                        <span className="builder-num">{String(r.round + 1).padStart(2, '0')}</span>
                        <span className="results-name">Round {r.round + 1}</span>
                        <span className="results-bar" aria-hidden="true">
                          <i style={{ transform: `scaleX(${r.reps / Math.max(1, ...timed.rounds.map((x) => x.reps))})` }} />
                        </span>
                        <span className="results-pctval">{r.reps}</span>
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </>
          )}

          {feedback.length > 0 && (
            <div className="results-feedback">
              <h2 className="label">What to work on</h2>
              <ul>
                {feedback.map((f, i) => (
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
        <button className="btn btn-ghost" onClick={onChoose}>
          Choose exercise
        </button>
        <button className="btn btn-primary" onClick={onAgain}>
          <Icon name="refresh" /> Again
        </button>
      </footer>
    </main>
  );
}
