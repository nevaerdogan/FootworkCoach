import { useState } from 'react';
import { CameraView } from '../components/CameraView';
import { Icon } from '../components/Icon';
import type { ConditioningPlan } from '../conditioning/exercises';
import { makeIntervalPlan, type IntervalPlan } from '../conditioning/IntervalSession';
import type { ConditioningResult } from '../conditioning/summary';
import { CountdownStage } from './CountdownStage';
import { FreeRepStage } from './FreeRepStage';
import { IntervalStage } from './IntervalStage';
import { RepSetupStage } from './RepSetupStage';
import './SessionScreen.css';

/** Dev only: ?fast shrinks the blocks so the whole flow can be tested in a minute. */
const FAST = import.meta.env.DEV && new URLSearchParams(location.search).has('fast');

type Stage = 'setup' | 'countdown' | 'free' | 'timed';

interface Props {
  plan: ConditioningPlan;
  onExit: () => void;
  onComplete: (result: ConditioningResult) => void;
}

function intervalPlanFor(plan: ConditioningPlan & { mode: 'timed' }): IntervalPlan {
  const p = makeIntervalPlan(plan.exercises, plan.rounds);
  return FAST ? { ...p, workSeconds: 8, restSeconds: 4, getReadySeconds: 3 } : p;
}

/** One camera stream for the whole conditioning session: placement check, then counting. */
export function RepSessionScreen({ plan, onExit, onComplete }: Props) {
  const [stage, setStage] = useState<Stage>('setup');
  const first = plan.mode === 'free' ? plan.exercise : plan.exercises[0];
  const steps = [
    { label: 'Camera', stages: ['setup'] },
    { label: 'Count', stages: ['countdown', 'free', 'timed'] },
  ];
  const index = steps.findIndex((s) => s.stages.includes(stage));

  return (
    <main className="screen session">
      <CameraView>
        <div className="session-overlay">
          <header className="session-top">
            <button className="btn btn-ghost" onClick={onExit} aria-label="Back">
              <Icon name="arrowLeft" />
            </button>
            <ol className="session-steps">
              {steps.map((s, i) => (
                <li key={s.label} className={i === index ? 'is-active' : i < index ? 'is-done' : ''}>
                  <span className="session-step-num">{String(i + 1).padStart(2, '0')}</span>
                  <span className="label">{s.label}</span>
                </li>
              ))}
            </ol>
          </header>

          {stage === 'setup' && <RepSetupStage exercise={first} onContinue={() => setStage(plan.mode === 'free' ? 'countdown' : 'timed')} />}
          {stage === 'countdown' && <CountdownStage sound onGo={() => setStage('free')} />}
          {stage === 'free' && plan.mode === 'free' && (
            <FreeRepStage exercise={plan.exercise} onFinish={(result) => onComplete({ mode: 'free', result })} />
          )}
          {stage === 'timed' && plan.mode === 'timed' && (
            <IntervalStage plan={intervalPlanFor(plan)} onComplete={(result) => onComplete({ mode: 'timed', result })} />
          )}
        </div>
      </CameraView>
    </main>
  );
}
