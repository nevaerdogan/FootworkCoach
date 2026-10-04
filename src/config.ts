// Every tunable threshold lives here. Do not scatter magic numbers elsewhere.

export const POSE_CONFIG = {
  /** Local copy of the MediaPipe WASM runtime (see scripts/copy-wasm.mjs). */
  wasmPath: '/mediapipe/wasm',
  modelPath:
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
  minPoseDetectionConfidence: 0.5,
  minPosePresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
} as const;

export const READINESS_CONFIG = {
  /** Landmark visibility below this counts as "not detected". */
  minVisibility: 0.6,
  /** Landmarks must sit at least this far inside the frame edge (normalized). */
  edgeMargin: 0.02,
  /** Body must stay fully visible this long before the user can continue. */
  stableMs: 700,
  /** After becoming ready, continue automatically if the user keeps holding position. */
  autoContinueMs: 1500,
} as const;

export type Stance = 'orthodox' | 'southpaw';

export const TRAINING_CONFIG = {
  /** Orthodox = left foot leads. */
  stance: 'orthodox' as Stance,
  /** Time allowed per expected movement before it counts as missed (paused while feet are not visible). */
  moveWindowMs: 5000,
  /** Countdown: 'Your turn' then 3·2·1, then GO. */
  countdownIntroMs: 700,
  countdownStepMs: 1000,
  countdownGoMs: 700,
  /** Show the last detection feedback this long. */
  feedbackMs: 1000,
  /** Pause after the last movement before showing results. */
  finishDelayMs: 600,
};

export const CALIBRATION_CONFIG = {
  /** How long the user must hold a still stance. */
  durationMs: 1200,
  /** Minimum valid frames in that window. */
  minFrames: 16,
  /** Max ankle drift from the first sample, in body-scale units, before restarting. */
  stillnessTolerance: 0.12,
  /** How long "Stance locked" shows before moving on automatically. */
  lockedHoldMs: 600,
} as const;

/**
 * Footwork detection thresholds. Units: body-scale (torso length) unless noted.
 * Forward/backward show up smaller than lateral moves in a front-facing 2D camera
 * (depth is foreshortened), so the forward axis is multiplied by `forwardGain`.
 */
export const FOOTWORK_CONFIG = {
  /** EMA smoothing factor for ankle positions (0..1, higher = less smoothing). */
  emaAlpha: 0.55,
  forwardGain: 2.0,
  /** Stance-center displacement that starts a movement. */
  startThreshold: 0.08,
  /** Per-foot displacement that marks when that foot started moving (foot order). */
  footStartThreshold: 0.06,
  /** Feet started within this window count as moving together. */
  footTogetherMs: 60,
  /** Smallest completed displacement accepted as an intentional step. */
  minDisplacement: 0.18,
  /** Feet slower than this (body units / s) count as planted. */
  settleVelocity: 0.5,
  /** Feet must stay planted this long to complete a movement. */
  settleMs: 150,
  /** When only one foot has moved, wait this long for the other foot to follow (step-drag). */
  followWaitMs: 380,
  minDurationMs: 150,
  maxDurationMs: 2500,
  /** A start must persist this long (or the feet must be moving) to be confirmed, else it's cancelled. */
  confirmMs: 66,
  /** After a completed movement, ignore new starts for this long (RECOVERY). */
  cooldownMs: 200,
  /** While at rest, the reference stance follows slow drift by this factor per frame. */
  restDriftAlpha: 0.02,
  /** Abort a movement if the feet are not visible for this long. */
  lostTimeoutMs: 400,
  /** Angle tolerance: direction confidence reaches 0 at this angle from the expected direction (deg). */
  directionToleranceDeg: 45,
  /** Torso-size change (log ratio) that contradicts a forward/back classification. */
  scaleCueTolerance: 0.03,
  scaleCuePenalty: 0.6,
  /** Results below this confidence are reported as unclear. */
  minConfidence: 0.35,

  // --- Stance switch / shift ---
  /**
   * Front/back gap between the ankles (image y, torso units) that counts as a clear stance.
   * The lead foot is closer to the camera, i.e. lower in the image; a switch flips the order.
   */
  switchMinGap: 0.07,
  /** Either foot moving this far (body units) also starts tracking a movement (switches barely move the centre). */
  footActiveThreshold: 0.14,

  // --- Heuristic pivot detection (body yaw from MediaPipe world landmarks) ---
  /** EMA factor for yaw angles. */
  yawAlpha: 0.35,
  /** Weight of shoulder yaw vs hip yaw in the combined rotation. */
  yawShoulderWeight: 0.5,
  /** Yaw change that starts tracking a movement (deg). */
  pivotStartDeg: 12,
  /** Minimum completed rotation to count as a pivot (deg). */
  pivotAngleThreshold: 30,
  /** A pivot must keep the hip center nearly in place (body units, forward gain applied). */
  pivotMaxTranslation: 0.35,
  /** Yaw must be slower than this (deg / s) to count as settled. */
  settleYawVelocity: 35,
  /** Yaw speed is measured over this window, not frame-to-frame (world depth is noisy). */
  yawVelocityWindowMs: 150,
} as const;

/**
 * Heuristic punch detection from MediaPipe world landmarks (meters).
 * extension = |shoulder→wrist| / (upper arm + forearm): ~0.5 in guard, ~1 fully straight.
 */
export const PUNCH_CONFIG = {
  /** EMA factor for arm signals (high: short punches must keep their peak). */
  alpha: 0.8,
  /** How fast each arm's guard (rest) values follow the user while the arm is at rest. */
  guardAlpha: 0.05,
  /**
   * Punch score = best of these cues, each normalized so 1 = clear punch:
   *   extension rise above guard / extRise, reach rise (m) / fwdRise,
   *   2D wrist travel (torso lengths) / spreadRise, or the absolute cue below.
   */
  extRise: 0.18,
  fwdRise: 0.1,
  spreadRise: 0.45,
  /** Jab vs cross: a shoulder turn toward the lead side of at least this much (deg) = rear hand. */
  crossTurnDeg: 12,
  /** Otherwise the hand that travelled further toward the camera (by at least this, m) threw it. */
  reachMargin: 0.04,
  /** Absolute cue (when depth is good): extension above this AND wrist this far forward (m). */
  extendOn: 0.86,
  minForward: 0.12,
  /** Score ≥ 1 starts a punch; it completes when the score falls below retractScore. */
  retractScore: 0.45,
  /** Score below this = arm at rest (guard is learned, punch start time is taken). */
  restScore: 0.3,
  /** Score above this = arm active: footwork ignores body rotation meanwhile. */
  activeScore: 0.5,
  minPunchMs: 60,
  /** The punch signal must stay up this long before a punch starts (rejects one-frame spikes). */
  minOutMs: 50,
  /** Arm held out longer than this is not a punch. */
  maxPunchMs: 1200,
  /** Wrist visibility needed to start tracking an arm (a punch in progress is kept through blur). */
  minVisibility: 0.25,
  /** Keep ignoring rotation this long after the arms are back in guard (torso returns). */
  suppressHoldMs: 450,
  /** After a punch, no new punch for this long (stops the recoil or guard hand from counting). */
  refractoryMs: 250,
} as const;

/** Shuffle / bounce rhythm (hip height vs a slow baseline, in torso lengths). */
export const BOUNCE_CONFIG = {
  /** Light smoothing of the hip signal. */
  alpha: 0.5,
  /** Baseline (resting height) follows a rising body slowly — it must not follow the bounce itself… */
  baselineAlpha: 0.015,
  /** …and settles quickly when the body drops (landing, or standing lower). */
  baselineDownAlpha: 0.3,
  /** Smallest rise that counts as a bounce. */
  minAmplitude: 0.022,
  /** Rise that counts as a clear, springy bounce (smaller ones are reported as weak). */
  goodAmplitude: 0.035,
  /** Bounces closer together than this are one bounce (≈ 5 per second max). */
  minIntervalMs: 200,
} as const;

/** Timed workouts (rounds of drill blocks). Defaults: 1 min work / 30 s rest / 4 rounds. */
export const WORKOUT_CONFIG = {
  workSeconds: 60,
  restSeconds: 30,
  rounds: 4,
  /** Short transition between blocks inside a round ("Next: Side to Side"). */
  switchSeconds: 5,
  /** Get-ready countdown before the first round. */
  getReadySeconds: 3,
  /** Score = accuracy·w + rhythm·w + volume·w (each 0..1), ×100. */
  weights: { accuracy: 0.6, rhythm: 0.25, volume: 0.15 },
  /** Tempo change between first and last round that triggers fatigue feedback. */
  fatigueDrop: 0.15,
} as const;

/**
 * Deterministic, explainable scoring. Every component is 0..1.
 * movementScore = Σ weight · component (×100); overall = mean of movement scores.
 */
export const SCORING_CONFIG = {
  weights: { direction: 0.45, displacement: 0.25, sequence: 0.2, timing: 0.1 },
  /** Size ratio (measured / expected) that scores full marks, and where it falls to 0. */
  sizeGood: [0.7, 1.6] as const,
  sizeZero: [0.2, 3] as const,
  /** Reaction delay from cue to movement start (ms). */
  reactionGoodMs: 1200,
  reactionZeroMs: 4000,
  /** Movement duration (ms). */
  durationGoodMs: 1200,
  durationZeroMs: 2500,
  /** Timing blend: reaction vs duration. */
  reactionWeight: 0.7,
  /** Sequence credit for a correct move performed out of its position. */
  outOfPositionCredit: 0.5,
  /** Thresholds that trigger feedback lines. */
  feedbackSizeLow: 0.7,
  feedbackSizeHigh: 1.8,
  feedbackStrongScore: 90,
  maxIssues: 3,
  maxPositives: 2,
};
