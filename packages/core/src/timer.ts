/**
 * A countdown timer that represents the estimated reading time for a content element.
 * Supports a target-ratio cap: advance() will not push progress beyond the
 * configured targetRatio, modelling "read up to the visible boundary" semantics.
 */
export class Timer {
  #initialDuration: number
  #remaining: number
  #targetRatio: number

  /**
   * @param durationSeconds - Estimated reading time in seconds.
   */
  constructor(durationSeconds: number) {
    this.#initialDuration = Math.max(0, durationSeconds)
    this.#remaining = this.#initialDuration
    this.#targetRatio = 1
  }

  /** The original estimated reading time in seconds. */
  get initialDuration(): number {
    return this.#initialDuration
  }

  /** Remaining time in seconds. */
  get remaining(): number {
    return this.#remaining
  }

  /** Whether the timer has reached zero. */
  get isComplete(): boolean {
    return this.#remaining <= 0
  }

  /** Reading progress as a ratio (0–1). */
  get progress(): number {
    if (this.#initialDuration === 0) return 1
    return 1 - this.#remaining / this.#initialDuration
  }

  /**
   * Maximum progress (0–1) that advance() is allowed to reach.
   * Set by the measurer to match the element's visibility ratio.
   *
   * @internal Used by Measurer — add-ons and external code must not set this.
   */
  get targetRatio(): number {
    return this.#targetRatio
  }

  /** @internal */
  set targetRatio(value: number) {
    if (!Number.isFinite(value) || value < 0 || value > 1) return
    this.#targetRatio = value
  }

  /** Whether progress has reached or exceeded the current targetRatio. */
  get isAtTarget(): boolean {
    if (this.#initialDuration === 0) return true
    return this.progress >= this.#targetRatio
  }

  /**
   * Advance the timer by the given number of seconds.
   * The timer will not go below zero, and remaining will not drop
   * below `initialDuration * (1 - targetRatio)`.
   */
  advance(seconds: number): void {
    const floor = this.#initialDuration * (1 - this.#targetRatio)
    this.#remaining = Math.max(floor, this.#remaining - seconds)
  }

  /**
   * Recalibrate the timer with a new duration, preserving current progress.
   * If progress is 60% and new duration is 10s, remaining becomes 4s.
   *
   * @param newDurationSeconds - New estimated reading time in seconds.
   */
  recalibrate(newDurationSeconds: number): void {
    const currentProgress = this.progress
    this.#initialDuration = Math.max(0, newDurationSeconds)
    this.#remaining = this.#initialDuration * (1 - currentProgress)
  }
}
