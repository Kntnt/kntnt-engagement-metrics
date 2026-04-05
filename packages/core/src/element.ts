import { Timer } from './timer.js'

/**
 * Tracks a single content element's visibility and reading state.
 */
export class TrackedElement {
  readonly node: Element
  readonly timer: Timer
  readonly charCount: number

  #visibilityRatio = 0
  #hasBeenSeen = false

  /**
   * @param node - The DOM element to track.
   * @param readingSpeed - Reading speed in characters per minute.
   */
  constructor(node: Element, readingSpeed: number) {
    this.node = node
    this.charCount = (node.textContent ?? '').length
    const durationSeconds = this.charCount > 0 ? (this.charCount / readingSpeed) * 60 : 0
    this.timer = new Timer(durationSeconds)
  }

  /** Current visibility ratio (0–1) as reported by IntersectionObserver. */
  get visibilityRatio(): number {
    return this.#visibilityRatio
  }

  /** Whether this element has ever been visible in the viewport. */
  get hasBeenSeen(): boolean {
    return this.#hasBeenSeen
  }

  /** Whether the reading timer for this element has completed. */
  get isFullyRead(): boolean {
    return this.timer.isComplete
  }

  /** Reading progress for this element (0–1). */
  get readingProgress(): number {
    return this.timer.progress
  }

  /**
   * Update visibility state from an IntersectionObserver entry.
   */
  updateVisibility(entry: IntersectionObserverEntry): void {
    this.#visibilityRatio = entry.intersectionRatio
    if (entry.isIntersecting && !this.#hasBeenSeen) {
      this.#hasBeenSeen = true
    }
  }
}
