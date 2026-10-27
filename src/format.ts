/** Minutes:seconds from whole seconds: 125 → "2:05". */
export const mmss = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/** A clock counting down: the remaining time rounds up, so 0:01 stays until the segment really ends. */
export const clockRemaining = (ms: number) => mmss(Math.max(0, Math.ceil(ms / 1000)));

/** A clock counting up: the elapsed time rounds down. */
export const clockElapsed = (ms: number) => mmss(Math.max(0, Math.floor(ms / 1000)));
