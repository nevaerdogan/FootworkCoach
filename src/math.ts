/** Clamp to the unit interval. Scores, confidences and depth signals all live in 0..1. */
export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
