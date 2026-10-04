import { useState } from 'react';
import { flushSync } from 'react-dom';
import { sampleResult } from './dev/sampleResult';
import type { BaselineState } from './footwork/baseline';
import type { MovementId } from './movements';
import { BuilderScreen } from './screens/BuilderScreen';
import { DemoScreen } from './screens/DemoScreen';
import { HomeScreen } from './screens/HomeScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { SelectScreen } from './screens/SelectScreen';
import { SessionScreen } from './screens/SessionScreen';
import { WorkoutResultsScreen } from './screens/WorkoutResultsScreen';
import { Intro } from './components/Intro';
import { PUNCH_COVER_MS, PunchTransition, punchAllowed } from './components/PunchTransition';
import {
  loadHistory,
  previousFor,
  previousWorkout,
  saveRecord,
  toRecord,
  toWorkoutRecord,
  type SessionRecord,
} from './training/history';
import { scoreSession } from './training/scoring';
import { unlockAudio } from './training/sounds';
import type { SessionResult } from './training/TrainingSession';
import { scoreWorkout } from './training/workoutScoring';
import { scaledWorkout, workoutMoves, type Workout } from './training/workouts';
import type { WorkoutResult } from './training/WorkoutSession';

/** Dev only: ?preview=results opens the results screen with a sample round. */
const PREVIEW_RESULTS = import.meta.env.DEV && new URLSearchParams(location.search).get('preview') === 'results';
/** Dev only: ?fast shrinks workout durations so the whole flow can be tested in a minute. */
const FAST = import.meta.env.DEV && new URLSearchParams(location.search).has('fast');
/** The opening sequence plays on every page load (dev: ?nointro skips it). */
const SHOW_INTRO = !(import.meta.env.DEV && new URLSearchParams(location.search).has('nointro')) && !PREVIEW_RESULTS;

type Screen = 'home' | 'select' | 'builder' | 'demo' | 'session' | 'practice' | 'results' | 'workoutResults';

/**
 * Flow: HOME → SELECT/BUILD → DEMO → SESSION (camera · stance · countdown · train | workout) → RESULTS.
 * Screen changes animate with the View Transitions API where available (cross-fade, scale, blur).
 */
function withTransition(update: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (doc.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    doc.startViewTransition(() => flushSync(update));
  } else update();
}

export function App() {
  const [screen, setScreenNow] = useState<Screen>(PREVIEW_RESULTS ? 'results' : 'home');
  const setScreen = (s: Screen) => withTransition(() => setScreenNow(s));
  const [combination, setCombination] = useState<MovementId[]>(() => (PREVIEW_RESULTS ? sampleResult().combination : []));
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [result, setResult] = useState<SessionResult | null>(() => (PREVIEW_RESULTS ? sampleResult() : null));
  const [workoutResult, setWorkoutResult] = useState<WorkoutResult | null>(null);
  // Remount the session for "Train again" so every round starts clean.
  const [round, setRound] = useState(0);
  // Calibrated stance, reused for the next rounds so they start straight at the countdown.
  const [baseline, setBaseline] = useState<BaselineState | null>(null);
  const [history, setHistory] = useState<SessionRecord[]>(() => loadHistory());
  const [previousScore, setPreviousScore] = useState<number | null>(null);
  const [intro, setIntro] = useState(SHOW_INTRO);
  const [punch, setPunch] = useState<number | null>(null);

  /** Big moments get the jab transition: the screen swaps while the glove covers it. */
  const punchTo = (s: Screen, before?: () => void) => {
    if (!punchAllowed()) {
      before?.();
      setScreenNow(s);
      return;
    }
    setPunch(Date.now());
    setTimeout(() => {
      before?.();
      setScreenNow(s);
    }, PUNCH_COVER_MS);
  };

  const watch = (c: MovementId[]) => {
    setWorkout(null);
    setCombination(c);
    setScreen('demo');
  };
  const watchWorkout = (w: Workout) => {
    setWorkout(FAST ? scaledWorkout(w, 0.15) : w);
    setCombination(workoutMoves(w));
    setScreen('demo');
  };
  const startSession = () => {
    unlockAudio(); // user gesture: allow round cues later
    punchTo('session', () => setRound((n) => n + 1));
  };
  const home = () => setScreen('home');

  const content = (() => {
    switch (screen) {
      case 'home':
        return (
          <HomeScreen
            history={history}
            onStart={() => punchTo('select')}
            onCustom={() => setScreen('builder')}
            onPractice={() => setScreen('practice')}
          />
        );
      case 'select':
        return <SelectScreen onBack={home} onContinue={watch} onWorkout={watchWorkout} />;
      case 'builder':
        return <BuilderScreen onBack={home} onContinue={watch} />;
      case 'demo':
        return <DemoScreen combination={combination} onBack={home} onReady={startSession} />;
      case 'session':
        return (
          <SessionScreen
            key={round}
            combination={combination}
            workout={workout ?? undefined}
            initialBaseline={baseline}
            onExit={home}
            onComplete={(r, b) => {
              setBaseline(b);
              setResult(r);
              // Compare with the previous round of the same combination, then store this one.
              setPreviousScore(previousFor(r.combination, history)?.overallScore ?? null);
              setHistory(saveRecord(toRecord(scoreSession(r), r)));
              setScreen('results');
            }}
            onWorkoutComplete={(r, b) => {
              setBaseline(b);
              setWorkoutResult(r);
              setPreviousScore(previousWorkout(r.workout.id, history)?.overallScore ?? null);
              setHistory(saveRecord(toWorkoutRecord(scoreWorkout(r), r)));
              setScreen('workoutResults');
            }}
          />
        );
      case 'practice':
        return <SessionScreen onExit={home} />;
      case 'results':
        return result ? (
          <ResultsScreen
            result={result}
            previousScore={previousScore}
            onTrainAgain={startSession}
            onNewRound={() => setScreen('select')}
            onHome={home}
          />
        ) : null;
      case 'workoutResults':
        return workoutResult ? (
          <WorkoutResultsScreen
            result={workoutResult}
            previousScore={previousScore}
            onTrainAgain={startSession}
            onNewWorkout={() => setScreen('select')}
            onHome={home}
          />
        ) : null;
    }
  })();

  return (
    <>
      <div className={intro ? 'app is-intro' : 'app'}>{content}</div>
      <PunchTransition play={punch} />
      {intro && <Intro onDone={() => setIntro(false)} />}
    </>
  );
}
