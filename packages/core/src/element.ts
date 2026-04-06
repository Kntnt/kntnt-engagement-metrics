import { IntervalSet } from './interval-set.js'
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
  #seenIntervals = new IntervalSet()
  #visibleStart = 0
  #visibleEnd = 0
  #computedTargetRatio = 0

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

  /** Cumulative fraction (0–1) of this element that has ever been visible. */
  get seenRatio(): number {
    return this.#seenIntervals.coverage
  }

  /** The merged seen intervals, for diagnostic/overlay use. */
  get seenIntervals(): ReadonlyArray<readonly [number, number]> {
    return this.#seenIntervals.intervals
  }

  /** Start of the currently visible interval (0 = element top, 1 = element bottom). */
  get visibleStart(): number {
    return this.#visibleStart
  }

  /** End of the currently visible interval (0 = element top, 1 = element bottom). */
  get visibleEnd(): number {
    return this.#visibleEnd
  }

  /**
   * Precomputed targetRatio based on the visible interval at the time of the last
   * IO callback. Snapshots timer progress so the ceiling doesn't slide as the
   * timer advances between callbacks.
   */
  get computedTargetRatio(): number {
    return this.#computedTargetRatio
  }

  /**
   * Record a visible interval for this element.
   * @internal Used by Measurer — add-ons and external code must not call this.
   */
  addSeenInterval(start: number, end: number): void {
    this.#seenIntervals.add(start, end)
  }

  /**
   * Update visibility state from an IntersectionObserver entry.
   * Computes the visible interval, accumulates it into seen intervals, and
   * snapshots the targetRatio based on current timer progress.
   */
  updateVisibility(entry: IntersectionObserverEntry): void {
    this.#visibilityRatio = entry.intersectionRatio
    if (entry.isIntersecting && !this.#hasBeenSeen) {
      this.#hasBeenSeen = true
    }

    // Compute the visible fraction as [start, end] in element-relative coordinates.
    const rect = entry.boundingClientRect
    const rootBounds = entry.rootBounds
    if (rootBounds && rect.height > 0) {
      const start = Math.max(0, Math.min(1, -rect.top / rect.height))
      const end = Math.max(0, Math.min(1, (rootBounds.height - rect.top) / rect.height))
      if (start < end) {
        this.#visibleStart = start
        this.#visibleEnd = end
        this.#seenIntervals.add(start, end)

        // Snapshot progress and compute target once per IO callback
        const progress = this.timer.progress
        const newReadable = Math.max(0, end - Math.max(start, progress))
        this.#computedTargetRatio = Math.min(1, progress + newReadable)
        return
      }
    }

    // Not visible or degenerate geometry — reset interval
    this.#visibleStart = 0
    this.#visibleEnd = 0
  }
}
