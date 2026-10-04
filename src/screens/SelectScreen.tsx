import { useState } from 'react';
import { Icon } from '../components/Icon';
import { FootworkDiagram } from '../components/FootworkDiagram';
import { MovementSequence } from '../components/MovementSequence';
import { MOVEMENTS, type MovementId } from '../movements';
import { DRILLS, generateCombination, PRESETS, type Level } from '../training/combinations';
import { totalSeconds, WORKOUTS, type Workout } from '../training/workouts';
import './pages.css';

const LEVELS: { id: Level; name: string; note: string }[] = [
  { id: 'BEGINNER', name: 'Beginner', note: 'Steps only' },
  { id: 'INTERMEDIATE', name: 'Intermediate', note: 'Steps + one pivot' },
  { id: 'ADVANCED', name: 'Advanced', note: 'Diagonals, dashes, pivots, punches' },
];

/** Seed 0 = the hand-written preset; other seeds come from the rule-based generator. */
const comboFor = (level: Level, seed: number): MovementId[] =>
  seed === 0 ? PRESETS[level] : generateCombination(level, PRESETS[level].length, seed);

type Tab = 'workouts' | 'rounds' | 'drills';
const TAB_LABEL: Record<Tab, string> = { workouts: 'Workouts', rounds: 'Rounds', drills: 'Drills' };

const duration = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

interface Props {
  onBack: () => void;
  onContinue: (combination: MovementId[]) => void;
  onWorkout: (workout: Workout) => void;
}

export function SelectScreen({ onBack, onContinue, onWorkout }: Props) {
  const [tab, setTab] = useState<Tab>('workouts');
  const [workoutId, setWorkoutId] = useState(WORKOUTS[0].id);
  // Hovering a row plays its chalk diagram.
  const [hovered, setHovered] = useState<string | null>(null);
  const hover = (id: string) => ({ onPointerEnter: () => setHovered(id), onPointerLeave: () => setHovered(null) });
  const [level, setLevel] = useState<Level>('BEGINNER');
  const [drill, setDrill] = useState(DRILLS[0].id);
  const [seeds, setSeeds] = useState<Record<Level, number>>({ BEGINNER: 0, INTERMEDIATE: 0, ADVANCED: 0 });

  const shuffle = () => setSeeds((s) => ({ ...s, [level]: s[level] + 1 }));
  const selected = tab === 'rounds' ? comboFor(level, seeds[level]) : DRILLS.find((d) => d.id === drill)!.moves;

  return (
    <main className="screen page">
      <header className="page-top">
        <button className="btn btn-ghost" onClick={onBack} aria-label="Back">
          <Icon name="arrowLeft" />
        </button>
        <div className="tabs" role="tablist">
          {(['workouts', 'rounds', 'drills'] as Tab[]).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={`tab ${tab === t ? 'is-active' : ''}`} onClick={() => setTab(t)}>
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>
      </header>

      <section className="page-body levels" key={tab}>
        {tab === 'workouts' &&
          WORKOUTS.map((w, i) => (
            <button
              key={w.id}
              className={`level level-drill ${workoutId === w.id ? 'is-selected' : ''}`}
              onClick={() => setWorkoutId(w.id)}
              aria-pressed={workoutId === w.id}
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <span className="level-index">{String(i + 1).padStart(2, '0')}</span>
              <span className="level-name">
                <span className="display">{w.name}</span>
                <span className="muted">
                  {w.rounds} rounds · {w.blocks.length > 1 ? `${w.blocks.length} drills × ` : ''}
                  {duration(w.blocks[0].seconds)} · {w.restSeconds} s rest · {duration(totalSeconds(w))} total
                </span>
                {w.source && <span className="level-source">From: {w.source}</span>}
              </span>
              <span className="level-blocks">
                {w.blocks.map((b) => (
                  <span key={b.name}>{b.name}</span>
                ))}
              </span>
            </button>
          ))}
        {tab === 'workouts' ? null : tab === 'rounds'
          ? LEVELS.map((l, i) => {
              const combo = comboFor(l.id, seeds[l.id]);
              const pivots = combo.filter((id) => MOVEMENTS[id].kind === 'pivot').length;
              return (
                <button
                  key={l.id}
                  className={`level ${level === l.id ? 'is-selected' : ''}`}
                  onClick={() => setLevel(l.id)}
                  {...hover(l.id)}
                  aria-pressed={level === l.id}
                  style={{ animationDelay: `${i * 70}ms` }}
                >
                  <span className="level-index">{String(i + 1).padStart(2, '0')}</span>
                  <span className="level-name">
                    <span className="display">{l.name}</span>
                    <span className="muted">
                      {combo.length} moves · {l.id === 'ADVANCED' ? l.note : pivots ? `${pivots} pivot` : l.note}
                    </span>
                    <MovementSequence items={combo} size="sm" key={seeds[l.id]} />
                  </span>
                  <span className="level-thumb">
                    <FootworkDiagram combination={combo} compact animate={hovered === l.id} stepMs={480} />
                  </span>
                </button>
              );
            })
          : (['footwork', 'punches'] as const).map((cat) => (
              <div key={cat} className="drill-group">
                <h2 className="label drill-heading">{cat === 'footwork' ? 'Footwork' : 'Footwork + punches'}</h2>
                {DRILLS.filter((d) => d.category === cat).map((d, i) => (
                  <button
                    key={d.id}
                    className={`level level-drill ${drill === d.id ? 'is-selected' : ''}`}
                    onClick={() => setDrill(d.id)}
                    {...hover(d.id)}
                    aria-pressed={drill === d.id}
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    <span className="level-index">{String(DRILLS.indexOf(d) + 1).padStart(2, '0')}</span>
                    <span className="level-name">
                      <span className="display">{d.name}</span>
                      <span className="muted">{d.focus}</span>
                      <MovementSequence items={d.moves} size="sm" />
                    </span>
                    <span className="level-thumb">
                      <FootworkDiagram combination={d.moves} compact animate={hovered === d.id} stepMs={480} />
                    </span>
                  </button>
                ))}
              </div>
            ))}
      </section>

      <footer className="page-bottom">
        {tab === 'workouts' ? (
          <span className="muted wk-hint">Stand 2–3 m from the camera. Sound on for round cues.</span>
        ) : tab === 'rounds' ? (
          <button className="btn btn-ghost" onClick={shuffle}>
            <Icon name="shuffle" /> New sequence
          </button>
        ) : (
          <span />
        )}
        <button
          className="btn btn-primary"
          onClick={() => (tab === 'workouts' ? onWorkout(WORKOUTS.find((w) => w.id === workoutId)!) : onContinue(selected))}
        >
          Watch demo <Icon name="arrowRight" />
        </button>
      </footer>
    </main>
  );
}
