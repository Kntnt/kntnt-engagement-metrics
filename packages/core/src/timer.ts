/**
 * A countdown timer that represents the estimated reading time for a content element.
 * Advances proportionally to the element's visibility ratio.
 */
export class Timer {
  #initialDuration: number
  #remaining: number

  /**
   * @param durationSeconds - Estimated reading time in seconds.
   */
  constructor(durationSeconds: number) {
    this.#initialDuration = Math.max(0, durationSeconds)
    this.#remaining = this.#initialDuration
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
   * Advance the timer by the given number of seconds.
   * The timer will not go below zero.
   */
  advance(seconds: number): void {
    this.#remaining = Math.max(0, this.#remaining - seconds)
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
