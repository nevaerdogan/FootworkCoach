import { FOOTWORK_CONFIG } from '../config';

/**
 *   IDLE ──active──▶ MOVEMENT_STARTED ──confirmed──▶ MOVEMENT_IN_PROGRESS
 *    ▲                    │ (drops back before confirm: CANCELLED)   │ planted for settleMs
 *    │                    ▼                                          ▼   (or maxDuration)
 *    └──── cooldown ── RECOVERY ◀──────────────────────── MOVEMENT_COMPLETED (one frame)
 *
 * Knows nothing about poses: the detector feeds it two booleans per frame.
 * `active`  = the stance has left the reference (displacement or rotation above start threshold).
 * `planted` = feet and body are currently not moving.
 */
export type MovementState =
  | 'IDLE'
  | 'MOVEMENT_STARTED'
  | 'MOVEMENT_IN_PROGRESS'
  | 'MOVEMENT_COMPLETED'
  | 'RECOVERY';

export type MachineEvent = 'STARTED' | 'CANCELLED' | 'COMPLETED' | 'TIMED_OUT' | 'RECOVERED';

export interface MachineInput {
  t: number;
  active: boolean;
  planted: boolean;
  /** Override how long the body must stay planted to complete (e.g. waiting for a follow foot). */
  settleMs?: number;
}

export interface MachineOutput {
  state: MovementState;
  event?: MachineEvent;
  /** For COMPLETED / TIMED_OUT: when the movement actually ended. */
  endTime?: number;
}

type MachineConfig = Record<'confirmMs' | 'settleMs' | 'maxDurationMs' | 'cooldownMs', number>;

export class MovementStateMachine {
  state: MovementState = 'IDLE';
  startedAt = 0;
  private settledSince: number | null = null;
  private recoverySince = 0;

  constructor(private cfg: MachineConfig = FOOTWORK_CONFIG) {}

  step({ t, active, planted, settleMs = this.cfg.settleMs }: MachineInput): MachineOutput {
    switch (this.state) {
      case 'MOVEMENT_COMPLETED':
        this.state = 'RECOVERY';
        this.recoverySince = t;
        return { state: this.state };

      case 'RECOVERY':
        if (t - this.recoverySince >= this.cfg.cooldownMs) {
          this.state = 'IDLE';
          return { state: this.state, event: 'RECOVERED' };
        }
        return { state: this.state };

      case 'IDLE':
        if (!active) return { state: this.state };
        this.state = 'MOVEMENT_STARTED';
        this.startedAt = t;
        this.settledSince = null;
        return { state: this.state, event: 'STARTED' };

      case 'MOVEMENT_STARTED':
        if (!active && planted) {
          this.state = 'IDLE';
          return { state: this.state, event: 'CANCELLED' };
        }
        if (!planted || t - this.startedAt >= this.cfg.confirmMs) this.state = 'MOVEMENT_IN_PROGRESS';
        return { state: this.state };

      case 'MOVEMENT_IN_PROGRESS': {
        if (planted) this.settledSince ??= t;
        else this.settledSince = null;
        if (this.settledSince !== null && t - this.settledSince >= settleMs) {
          this.state = 'MOVEMENT_COMPLETED';
          return { state: this.state, event: 'COMPLETED', endTime: this.settledSince };
        }
        if (t - this.startedAt > this.cfg.maxDurationMs) {
          this.state = 'MOVEMENT_COMPLETED';
          return { state: this.state, event: 'TIMED_OUT', endTime: t };
        }
        return { state: this.state };
      }
    }
  }

  get isMoving() {
    return this.state === 'MOVEMENT_STARTED' || this.state === 'MOVEMENT_IN_PROGRESS';
  }

  abort() {
    this.state = 'IDLE';
    this.settledSince = null;
  }
}
