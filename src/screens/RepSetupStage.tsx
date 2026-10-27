import { useCallback } from 'react';
import { Icon } from '../components/Icon';
import { useMediaQuery } from '../components/useMediaQuery';
import { EXERCISES, type ExerciseId } from '../conditioning/exercises';
import { assessExerciseReadiness } from '../pose/readiness';
import type { PoseFrame } from '../pose/types';
import { SetupStage } from './SetupStage';

const COPY = {
  CONFIRMED: { title: 'Position checked', body: 'Press Continue, then get into position.' },
  NO_PERSON: { title: 'Step into frame', body: 'Stand on the spot where you will exercise, 2–3 m from the camera.' },
  STEP_BACK: { title: 'Step back', body: 'Move back until your legs and feet are in the frame.' },
};

interface Props {
  exercise: ExerciseId;
  onContinue: () => void;
}

/**
 * Camera placement for a conditioning exercise: the shared framing check, with the exercise's own
 * guidance on where to put the phone. Side-on exercises only need one side of the body visible.
 */
export function RepSetupStage({ exercise, onContinue }: Props) {
  const def = EXERCISES[exercise];
  const assess = useCallback((frame: PoseFrame | null) => assessExerciseReadiness(frame, def.parts, def.view), [def]);
  // A lying body is wide: on a phone, the camera must be in landscape to see all of it.
  const portraitPhone = useMediaQuery('(orientation: portrait) and (max-width: 900px)');

  return (
    <SetupStage
      onContinue={onContinue}
      assess={assess}
      parts={def.parts}
      copy={COPY}
      kicker={
        <span className="label rep-setup-kicker">
          <Icon name={def.icon} /> {def.label} · {def.setup.title}
        </span>
      }
    >
      <p className="rep-setup-how muted">
        {def.setup.body}
        {def.view === 'side' && portraitPhone && <strong> Turn your phone sideways so it can see all of you lying down.</strong>}
      </p>
    </SetupStage>
  );
}
