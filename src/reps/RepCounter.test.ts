import { describe, expect, it } from 'vitest';
import { RepCounter, type RepEvent } from './RepCounter';

const cfg = { enter: 0.85, exit: 0.25, partial: 0.4, minRepMs: 400, minHoldMs: 50 };

/** Feed a depth curve (time relative to `start`) sampled every 33 ms. */
function run(counter: RepCounter, curve: (t: number) => number, ms: number, start = 0): RepEvent[] {
  const events: RepEvent[] = [];
  for (let t = start; t <= start + ms; t += 33) {
    const e = counter.push(curve(t - start), t);
    if (e) events.push(e);
  }
  return events;
}

const bump = (ms: number, peak = 1) => (t: number) => (t < 0 || t > ms ? 0 : peak * Math.sin((Math.PI * t) / ms));

describe('RepCounter', () => {
  it('counts one rep per full excursion, on the way back to rest', () => {
    const c = new RepCounter(cfg);
    const events = run(c, bump(1000), 1400);
    expect(c.reps).toBe(1);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'rep', count: 1 });
    expect(events[0].peak).toBeGreaterThan(0.95);
    expect(events[0].t).toBeGreaterThan(900); // counted after the return, not at the bottom
  });

  it('hovering around the thresholds never produces phantom reps', () => {
    const c = new RepCounter(cfg);
    // Down, then wobble around `enter` for 3 s without ever coming up.
    run(c, (t) => (t < 300 ? t / 300 : 0.85 + 0.08 * Math.sin(t / 40)), 3300);
    expect(c.reps).toBe(0);
    // Back up, then wobble around `exit`: one rep, no more.
    run(c, (t) => 0.25 + 0.1 * Math.sin(t / 40), 3000, 4000);
    expect(c.reps).toBe(1);
  });

  it('a shallow excursion is a partial rep, not a rep', () => {
    const c = new RepCounter(cfg);
    const events = run(c, bump(1000, 0.6), 1400);
    expect(c.reps).toBe(0);
    expect(c.partials).toBe(1);
    expect(events[0].kind).toBe('partial');
  });

  it('an excursion that never reaches `partial` is ignored', () => {
    const c = new RepCounter(cfg);
    run(c, bump(1000, 0.3), 1400);
    expect(c.reps + c.partials).toBe(0);
  });

  it('a one-frame spike to full depth is noise, not a rep', () => {
    const c = new RepCounter(cfg);
    run(c, (t) => (t === 495 ? 1 : t > 200 && t < 800 ? 0.5 : 0), 1200);
    expect(c.reps).toBe(0);
  });

  it('a rep faster than the minimum duration is rejected', () => {
    const c = new RepCounter(cfg);
    run(c, bump(200), 600);
    expect(c.reps).toBe(0);
    run(c, bump(1000), 1400, 1000);
    expect(c.reps).toBe(1);
  });

  it('a set that starts at the bottom does not count the rise as a rep', () => {
    const c = new RepCounter(cfg);
    // Counting starts with the body already at full depth; it comes up over 600 ms…
    run(c, (t) => Math.max(0, 1 - t / 600), 800);
    expect(c.reps + c.partials).toBe(0);
    // …and the next full excursion counts as usual.
    run(c, bump(1000), 1400, 1000);
    expect(c.reps).toBe(1);
  });

  it('abort drops the excursion in progress but keeps the totals', () => {
    const c = new RepCounter(cfg);
    run(c, bump(1000), 1400);
    run(c, (t) => Math.min(1, t / 400), 500, 2000); // on the way down…
    c.abort(); // …tracking lost
    run(c, () => 0, 300, 3000);
    expect(c.reps).toBe(1);
  });
});
