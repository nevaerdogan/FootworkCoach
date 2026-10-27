import { mmss } from '../format';
import { useState } from 'react';
import { Icon } from '../components/Icon';
import { EXERCISE_LIST, type ConditioningPlan, type ExerciseId } from '../conditioning/exercises';
import { intervalTotalSeconds, makeIntervalPlan } from '../conditioning/IntervalSession';
import { CONDITIONING_CONFIG } from '../config';
import './pages.css';
import './RepStage.css';

type Tab = 'timed' | 'free';
const TAB_LABEL: Record<Tab, string> = { timed: 'Timed', free: 'Free' };
const C = CONDITIONING_CONFIG;

interface Props {
  onBack: () => void;
  onStart: (plan: ConditioningPlan) => void;
}

/**
 * Push-ups, sit-ups, jump rope. Timed: pick the exercises for a 45 s on / 15 s off circuit and the
 * number of rounds. Free: pick one exercise and count until you stop.
 */
export function ConditioningScreen({ onBack, onStart }: Props) {
  const [tab, setTab] = useState<Tab>('timed');
  const [selected, setSelected] = useState<Set<ExerciseId>>(() => new Set(EXERCISE_LIST.map((e) => e.id)));
  const [rounds, setRounds] = useState<number>(C.rounds);
  const [exercise, setExercise] = useState<ExerciseId>('PUSH_UP');

  const toggle = (id: ExerciseId) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const exercises = EXERCISE_LIST.filter((e) => selected.has(e.id)).map((e) => e.id);
  const total = exercises.length ? intervalTotalSeconds(makeIntervalPlan(exercises, rounds)) : 0;

  const start = () => onStart(tab === 'timed' ? { mode: 'timed', exercises, rounds } : { mode: 'free', exercise });

  return (
    <main className="screen page">
      <header className="page-top">
        <button className="btn btn-ghost" onClick={onBack} aria-label="Back">
          <Icon name="arrowLeft" />
        </button>
        <div className="tabs" role="tablist">
          {(['timed', 'free'] as Tab[]).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={`tab ${tab === t ? 'is-active' : ''}`} onClick={() => setTab(t)}>
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>
      </header>

      <section className="page-body levels" key={tab}>
        <p className="muted cond-intro">
          {tab === 'timed'
            ? `Every exercise is ${C.workSeconds} s of work, then ${C.restSeconds} s of rest. Reps are counted and spoken aloud.`
            : 'Pick one exercise and go. Every rep is counted and spoken aloud until you finish.'}
        </p>
        {EXERCISE_LIST.map((e, i) => {
          const on = tab === 'timed' ? selected.has(e.id) : exercise === e.id;
          return (
            <button
              key={e.id}
              className={`level level-drill ${on ? 'is-selected' : ''}`}
              onClick={() => (tab === 'timed' ? toggle(e.id) : setExercise(e.id))}
              aria-pressed={on}
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <span className="level-index">{String(i + 1).padStart(2, '0')}</span>
              <span className="level-name">
                <span className="display">{e.label}</span>
                <span className="muted">{e.setup.body}</span>
              </span>
              <span className="level-thumb rep-thumb">
                <Icon name={on && tab === 'timed' ? 'check' : e.icon} />
              </span>
            </button>
          );
        })}
        {tab === 'timed' && (
          <div className="cond-rounds">
            <span className="label">Rounds</span>
            <div className="cond-stepper" role="group" aria-label="Rounds">
              <button onClick={() => setRounds((r) => Math.max(C.minRounds, r - 1))} disabled={rounds <= C.minRounds} aria-label="Fewer rounds">
                −
              </button>
              <strong className="display">{rounds}</strong>
              <button onClick={() => setRounds((r) => Math.min(C.maxRounds, r + 1))} disabled={rounds >= C.maxRounds} aria-label="More rounds">
                +
              </button>
            </div>
            <span className="muted cond-total">
              {exercises.length} {exercises.length === 1 ? 'exercise' : 'exercises'} × {rounds} · {mmss(C.workSeconds)} on / {C.restSeconds} s off ·{' '}
              {mmss(total)} total
            </span>
          </div>
        )}
      </section>

      <footer className="page-bottom">
        <span className="muted wk-hint">Sound on: reps and rests are spoken, so you never have to look at the screen.</span>
        <button className="btn btn-primary" disabled={tab === 'timed' && exercises.length === 0} onClick={start}>
          Set up camera <Icon name="arrowRight" />
        </button>
      </footer>
    </main>
  );
}
