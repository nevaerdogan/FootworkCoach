import { useState } from 'react';
import { CameraView } from '../components/CameraView';
import { Icon } from '../components/Icon';
import type { BaselineState } from '../footwork/baseline';
import type { MovementId } from '../movements';
import type { SessionResult } from '../training/TrainingSession';
import type { Workout } from '../training/workouts';
import type { WorkoutResult } from '../training/WorkoutSession';
import { CalibrationStage } from './CalibrationStage';
import { CountdownStage } from './CountdownStage';
import { PracticeStage } from './PracticeStage';
import { SetupStage } from './SetupStage';
import { TrainingStage } from './TrainingStage';
import { WorkoutStage } from './WorkoutStage';
import './SessionScreen.css';

type Stage = 'setup' | 'calibrate' | 'countdown' | 'train' | 'workout' | 'practice';

interface Props {
  /** With a combination: guided training round. Without: free practice. */
  combination?: MovementId[];
  /** Timed workout (rounds of drill blocks). Takes precedence over `combination`. */
  workout?: Workout;
  /** Stance from an earlier round: skip camera setup and calibration, go straight to the countdown. */
  initialBaseline?: BaselineState | null;
  onExit: () => void;
  onComplete?: (result: SessionResult, baseline: BaselineState) => void;
  onWorkoutComplete?: (result: WorkoutResult, baseline: BaselineState) => void;
}

/** One camera stream for the whole session; stages swap on top of it. */
export function SessionScreen({ combination, workout, initialBaseline, onExit, onComplete, onWorkoutComplete }: Props) {
  const guided = !!(workout || combination);
  const reuse = guided && !!initialBaseline;
  const firstStage: Stage = workout ? 'workout' : 'countdown';
  const [stage, setStage] = useState<Stage>(reuse ? firstStage : 'setup');
  const [baseline, setBaseline] = useState<BaselineState | null>(reuse ? initialBaseline! : null);

  const steps = [
    { label: 'Camera', stages: ['setup'] },
    { label: 'Stance', stages: ['calibrate'] },
    guided ? { label: 'Train', stages: ['countdown', 'train', 'workout'] } : { label: 'Practice', stages: ['practice'] },
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

          {stage === 'setup' && <SetupStage onContinue={() => setStage('calibrate')} />}
          {stage === 'calibrate' && (
            <CalibrationStage
              onCaptured={setBaseline}
              onDone={() => setStage(guided ? firstStage : 'practice')}
            />
          )}
          {stage === 'countdown' && <CountdownStage onGo={() => setStage('train')} />}
          {stage === 'train' && baseline && combination && (
            <TrainingStage baseline={baseline} combination={combination} onComplete={(r) => onComplete?.(r, baseline)} />
          )}
          {stage === 'workout' && baseline && workout && (
            <WorkoutStage baseline={baseline} workout={workout} onComplete={(r) => onWorkoutComplete?.(r, baseline)} />
          )}
          {stage === 'practice' && baseline && (
            <PracticeStage baseline={baseline} onRecalibrate={() => setStage('calibrate')} onDone={onExit} />
          )}
        </div>
      </CameraView>
    </main>
  );
}
