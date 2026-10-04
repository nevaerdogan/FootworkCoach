import type { Vec2 } from './geometry';

/** Exponential moving average for a 2D point. Lightweight and stable enough for ankle tracks. */
export class EmaVec2 {
  private v: Vec2 | null = null;

  constructor(private alpha: number) {}

  push(p: Vec2): Vec2 {
    this.v = this.v
      ? { x: this.v.x + this.alpha * (p.x - this.v.x), y: this.v.y + this.alpha * (p.y - this.v.y) }
      : { ...p };
    return this.v;
  }

  reset() {
    this.v = null;
  }
}
