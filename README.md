# Footwork Coach

A browser-based kickboxing footwork trainer. Watch a drill, perform it in front of your camera, and get an objective breakdown of what you did: direction, distance, timing and rhythm.

**Try it:** [footworkcoach.pages.dev](https://footworkcoach.pages.dev)

Everything runs on your device. The camera stream is never uploaded, there is no backend, and the analysis is deterministic geometry — no machine-learning model beyond pose estimation, and no LLM.

## Features

- **Live movement detection** for steps, diagonals, dashes, pivots, stance switches, shifts, shuffle/bounce rhythm, and jab/cross.
- **Animated demo fighter** that performs every drill before you try it, driven by the same movement definitions the detector uses.
- **Drills, rounds and timed workouts** — work/rest intervals (default 1 min / 30 s, 4 rounds) with spoken English cues, a round bell and rest screens.
- **Custom combinations** built from any detectable move.
- **Rep counting** for push-ups, sit-ups and jump rope — timed circuits (45 s work / 15 s rest, 1–6 rounds) or free practice, with every rep spoken aloud so you never have to look at the screen, partial reps flagged, and the screen kept awake.
- **Scoring and results** — per-move accuracy, sequence alignment, a footwork trajectory diagram, and history with comparison to your previous session (stored in `localStorage`).
- **Responsive** across phone (portrait and landscape), tablet and desktop, with safe-area support and reduced-motion respected.

## Tech stack

| Area | Choice | Why |
| --- | --- | --- |
| Build | [Vite](https://vite.dev) | Fast dev server and a plain static build that any CDN can host. |
| UI | React 19 + TypeScript | Component model for the multi-screen flow; strict types for the geometry code. |
| Pose | [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker) `PoseLandmarker` (lite) | Real-time 33-point body landmarks in the browser via WASM, GPU with CPU fallback. |
| Styling | Plain CSS with design tokens | No runtime cost, full control over motion and layout. |
| Fonts | Fontsource (Big Shoulders Display, Archivo, Chivo Mono) | Self-hosted, no third-party font requests. |
| Audio | Web Audio + Web Speech API | Beeps and voice cues with zero assets and no network. |
| Tests | [Vitest](https://vitest.dev) | Unit tests for detectors, state machines, scoring and sessions. |

There is no state-management, routing or UI-kit dependency on purpose: the app is small enough that React state and CSS are clearer than an abstraction layer.

## How it works

```
camera ─► PoseLandmarker ─► PoseFrame ─► MotionAnalyzer ─► movement events ─► TrainingSession / WorkoutSession ─► scoring ─► results
                                          ├─ FootworkDetector  (steps, pivots, switches)
                                          ├─ PunchDetector     (jab / cross)
                                          └─ BounceDetector    (shuffle rhythm)
```

1. **Pose** (`src/pose`) — landmarks are converted to a `PoseFrame` in raw, unmirrored image coordinates. Mirroring is display-only (CSS), so "left" always means the athlete's anatomical left.
2. **Calibration** — the athlete holds their stance briefly; this baseline defines body space: lateral and forward axes, measured in torso lengths so results don't depend on camera distance.
3. **Detection** (`src/footwork`) — smoothed foot positions drive a movement state machine (`IDLE → MOVEMENT_STARTED → MOVEMENT_IN_PROGRESS → MOVEMENT_COMPLETED → RECOVERY`). Steps wait for the trailing foot to follow; pivots use torso yaw from world landmarks; stance switches watch the front/back order of the ankles. `MotionAnalyzer` combines the detectors and resolves conflicts (e.g. a cross rotates the torso, but must not count as a pivot).
4. **Training** (`src/training`) — sessions open a window for each expected move and match what was detected. Scoring weighs direction, displacement, sequence (LCS alignment) and timing. Workouts add a schedule of work/rest blocks and score accuracy, rhythm and volume.
5. **Definitions** (`src/movements.ts`) — the single source of truth for every move: detection, demo animation, combination rules and scoring all read from it.

### Rep counting

```
camera ─► PoseLandmarker ─► PoseFrame ─► ExerciseCounter ─► rep events ─► IntervalSession / free set ─► summary ─► results
                                          ├─ PushUpCounter  elbow angle, side view
                                          ├─ SitUpCounter   torso angle above the floor, side view
                                          └─ JumpCounter    hip height peaks, front view
```

Push-ups and sit-ups are measured from a side view, the way most pose-based rep counters work. A joint angle becomes a 0..1 depth signal that a hysteresis counter (`src/reps/RepCounter.ts`) turns into reps: a rep is entered above one threshold and counted only when the body is back below a lower one, so hovering near a threshold never produces phantom reps. Push-ups use the elbow angle (straight arms ≈ 155°, full depth ≈ 95°); sit-ups use the torso's angle above the floor line, which does not depend on how far the knees are bent. Attempts that reach only part of the range are reported as partial reps, not counted. A posture gate (torso near the floor for push-ups, legs on the floor for sit-ups, standing for rope) means arm curls while standing never count as push-ups.

Jump rope counts jumps from the hip height above a slowly following resting height, in torso lengths. Two rules matter for skipping: the feet must leave the floor too (a knee bend is not a jump), and a jump must reach half the height of the recent jumps, so the small rebound hop of the "double bounce" style is not counted as a second jump.

All tunable thresholds live in `src/config.ts`.

## Project structure

```
src/
  movements.ts     Movement definitions shared by detection, demo and scoring
  config.ts        Every threshold and timing constant
  pose/            Pose estimation wrapper, landmark conversion, readiness checks, skeleton drawing
  footwork/        Detectors, smoothing, geometry, calibration baseline, state machine
  reps/            Rep counters for push-ups, sit-ups and jump rope, and the hysteresis counter they share
  conditioning/    Exercise definitions, timed interval session, result summaries
  training/        Sessions, workouts, combinations, scoring, history, sounds
  demo/            Timeline that animates the demo fighter
  components/      Camera view, demo fighter, footwork diagram, rep dial, transitions
  screens/         Home, select, builder, demo, camera session stages, rep counting, results
  styles/          Design tokens, global styles, responsive layer
  dev/             Development-only tools (excluded from production builds)
  test/            Shared test fixtures
scripts/
  copy-wasm.mjs    Copies the MediaPipe WASM runtime into public/ on install
```

## Getting started

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

`npm install` also copies the MediaPipe WASM files into `public/mediapipe/wasm` (see `scripts/copy-wasm.mjs`). The pose model itself is downloaded at runtime from Google's model storage.

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm test` | Run the unit tests |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the production build locally |

### Development flags

Available in `npm run dev` only:

- `?synthetic` — replaces the webcam with a scripted pose feed that runs through the real pipeline; `?synthetic=pushup`, `situp` or `jump` plays a rep-counting exercise instead.
- `?fast` — shortens workouts and timed conditioning blocks for quick runs.
- `?nointro` — skips the intro animation.
- `?preview=results` — opens the results screen with sample data.

`?debug` shows a live detector panel in any build.

## Deployment

The app is a static site, so any static host works. It is live at **[footworkcoach.pages.dev](https://footworkcoach.pages.dev)**, deployed on Cloudflare Pages from GitHub on every push to `main`:

- Build command: `npm run build`
- Output directory: `dist`
- Node version: from `.node-version`

`public/_headers` sets security headers, restricts device permissions to the camera, and caches the fingerprinted assets and the MediaPipe runtime.

The camera requires a secure context, so the site must be served over **HTTPS** (localhost is exempt during development).

## Privacy

Video frames are processed in the browser and discarded. Nothing is uploaded or stored except your session history, which stays in your browser's `localStorage`.

## Browser support

Recent Chrome, Edge, Safari (iOS 16.4+) and Firefox with camera access. For best results, place the camera so your whole body, including your feet, is in frame. For push-ups and sit-ups lay the phone on its side on the floor, 2–3 m away, so it sees you from the side; for jump rope prop it up facing you.

## License

[MIT](LICENSE). Third-party components keep their own licenses: MediaPipe (Apache 2.0) and the Fontsource fonts (SIL Open Font License).
