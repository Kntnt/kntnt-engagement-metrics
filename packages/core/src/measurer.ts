import { TrackedElement } from './element.js'
import type { EngagementMetrics, MeasurerConfig, MetricsListener } from './types.js'

const DEFAULTS: MeasurerConfig = {
  selector: 'p',
  exclude: '',
  readingSpeed: 863,
  tickInterval: 200,
  observerThresholds: [0, 0.25, 0.5, 0.75, 1.0],
  scrollSpeedThreshold: 50,
  scrollCooldown: 500,
}

/**
 * Central orchestrator for engagement measurement.
 *
 * Discovers content elements in the DOM, tracks their visibility via
 * IntersectionObserver, and runs a measurement tick loop that estimates
 * reading progress. Notifies registered listeners on each tick.
 */
export class Measurer {
  readonly #config: MeasurerConfig
  readonly #listeners: Set<MetricsListener> = new Set()
  #elements: TrackedElement[] = []
  #elementMap: Map<Element, TrackedElement> = new Map()

  #observer: IntersectionObserver | null = null
  #animationFrameId: number | null = null
  #lastTickTime = 0
  #isScrolling = false
  #isPageVisible = true
  #isActive = false
  #scrollTimeoutId: ReturnType<typeof setTimeout> | null = null
  #lastScrollY = 0
  #lastScrollTime = 0
  #maxScanningDepth = 0

  constructor(config: Partial<MeasurerConfig> = {}) {
    this.#config = { ...DEFAULTS, ...config }
  }

  /** True if measurement is currently running. */
  get isActive(): boolean {
    return this.#isActive
  }

  /** Register a metrics listener. */
  addListener(listener: MetricsListener): void {
    this.#listeners.add(listener)
  }

  /** Remove a previously registered listener. */
  removeListener(listener: MetricsListener): void {
    this.#listeners.delete(listener)
  }

  /** Start measuring. Call after the DOM is ready. */
  start(): void {
    if (this.#isActive) return

    // Clear state from any previous run (length = 0 preserves the array reference
    // so that code holding a reference from getElements() stays valid)
    this.#elements.length = 0
    this.#elementMap.clear()
    this.#maxScanningDepth = 0

    // Discover content elements (wrapped in try-catch for invalid selectors)
    const nodes = this.#discoverNodes()
    if (!nodes) return

    for (const node of nodes) {
      const tracked = new TrackedElement(node, this.#config.readingSpeed)
      this.#elements.push(tracked)
      this.#elementMap.set(node, tracked)
    }

    if (this.#elements.length === 0) {
      console.warn(
        '[kntnt-engagement-metrics] No content elements found for selector:',
        this.#config.selector,
      )
      return
    }

    // Set up IntersectionObserver
    this.#observer = new IntersectionObserver((entries) => this.#handleIntersection(entries), {
      threshold: this.#config.observerThresholds,
    })
    for (const element of this.#elements) {
      this.#observer.observe(element.node)
    }

    // Set up scroll listener
    window.addEventListener('scroll', this.#handleScroll, { passive: true })

    // Set up page visibility listener
    document.addEventListener('visibilitychange', this.#handleVisibilityChange)

    // Start the tick loop
    this.#isActive = true
    this.#lastTickTime = performance.now()
    this.#animationFrameId = requestAnimationFrame((t) => this.#tick(t))
  }

  /** Stop measuring and clean up all observers and listeners. */
  stop(): void {
    if (!this.#isActive) return
    this.#isActive = false

    if (this.#animationFrameId !== null) {
      cancelAnimationFrame(this.#animationFrameId)
      this.#animationFrameId = null
    }

    this.#observer?.disconnect()
    this.#observer = null

    window.removeEventListener('scroll', this.#handleScroll)
    document.removeEventListener('visibilitychange', this.#handleVisibilityChange)

    if (this.#scrollTimeoutId !== null) {
      clearTimeout(this.#scrollTimeoutId)
      this.#scrollTimeoutId = null
    }
  }

  /** Get the current metrics snapshot. */
  getMetrics(): EngagementMetrics {
    return this.#computeMetrics()
  }

  /** Expose tracked elements for visualization or diagnostic purposes. */
  getElements(): ReadonlyArray<TrackedElement> {
    return this.#elements
  }

  /**
   * Change the reading speed and recalibrate all element timers.
   * Preserves each element's current reading progress.
   *
   * @param charsPerMinute - New reading speed in characters per minute. Must be a positive number.
   */
  setReadingSpeed(charsPerMinute: number): void {
    if (!Number.isFinite(charsPerMinute) || charsPerMinute <= 0) {
      console.warn('[kntnt-engagement-metrics] Invalid reading speed:', charsPerMinute)
      return
    }

    for (const element of this.#elements) {
      const newDuration = element.charCount > 0 ? (element.charCount / charsPerMinute) * 60 : 0
      element.timer.recalibrate(newDuration)
    }
  }

  /** Query the DOM for matching content elements, filtering by config. Returns null on error. */
  #discoverNodes(): Element[] | null {
    let nodes: NodeListOf<Element>
    try {
      nodes = document.querySelectorAll(this.#config.selector)
    } catch {
      console.warn('[kntnt-engagement-metrics] Invalid selector:', this.#config.selector)
      return null
    }

    const { exclude } = this.#config
    const result: Element[] = []

    for (const node of nodes) {
      if (exclude && this.#isExcluded(node, exclude)) continue
      if (!('offsetHeight' in node) || (node as HTMLElement).offsetHeight === 0) continue
      if ((node.textContent ?? '').length === 0) continue
      result.push(node)
    }

    return result
  }

  /** Check whether a node matches the exclude selector or has a matching ancestor. */
  #isExcluded(node: Element, exclude: string): boolean {
    try {
      return node.closest(exclude) !== null
    } catch {
      console.warn('[kntnt-engagement-metrics] Invalid exclude selector:', exclude)
      return true // treat as excluded on invalid selector
    }
  }

  #handleIntersection(entries: IntersectionObserverEntry[]): void {
    for (const entry of entries) {
      const element = this.#elementMap.get(entry.target)
      if (!element) continue

      const wasSeen = element.hasBeenSeen
      element.updateVisibility(entry)

      // Cache scanning depth when an element is first seen
      if (!wasSeen && element.hasBeenSeen && element.node.isConnected) {
        const rect = element.node.getBoundingClientRect()
        const elementBottom = rect.bottom + window.scrollY
        if (elementBottom > this.#maxScanningDepth) {
          this.#maxScanningDepth = elementBottom
        }
      }
    }
  }

  #handleScroll = (): void => {
    const now = performance.now()
    const scrollY = window.scrollY
    const timeDelta = now - this.#lastScrollTime
    const distance = Math.abs(scrollY - this.#lastScrollY)

    if (timeDelta > 0) {
      const speed = (distance / timeDelta) * 1000 // px/sec
      if (speed > this.#config.scrollSpeedThreshold) {
        this.#isScrolling = true
      }
    }

    this.#lastScrollY = scrollY
    this.#lastScrollTime = now

    // Reset scroll cooldown
    if (this.#scrollTimeoutId !== null) {
      clearTimeout(this.#scrollTimeoutId)
    }
    this.#scrollTimeoutId = setTimeout(() => {
      this.#isScrolling = false
      this.#scrollTimeoutId = null
    }, this.#config.scrollCooldown)
  }

  #handleVisibilityChange = (): void => {
    this.#isPageVisible = document.visibilityState === 'visible'
  }

  #tick(timestamp: number): void {
    if (!this.#isActive) return

    if (timestamp - this.#lastTickTime >= this.#config.tickInterval) {
      this.#advanceTimers()
      const metrics = this.#notifyListeners()
      this.#lastTickTime = timestamp

      if (metrics.readingRatio >= 1 && metrics.scanningRatio >= 1) {
        this.stop()
        return
      }
    }

    this.#animationFrameId = requestAnimationFrame((t) => this.#tick(t))
  }

  /** Advance element timers if the page is visible and not scrolling. */
  #advanceTimers(): void {
    if (!this.#isPageVisible || this.#isScrolling) return
    const elapsed = this.#config.tickInterval / 1000

    for (const element of this.#elements) {
      if (element.isFullyRead || element.visibilityRatio === 0) continue
      element.timer.advance(elapsed * element.visibilityRatio)
    }
  }

  /** Compute metrics and notify all listeners. Returns the metrics snapshot. */
  #notifyListeners(): EngagementMetrics {
    const metrics = this.#computeMetrics()
    for (const listener of this.#listeners) {
      try {
        listener.update(metrics)
      } catch (e) {
        console.warn('[kntnt-engagement-metrics] Listener error:', e)
      }
    }
    return metrics
  }

  #computeMetrics(): EngagementMetrics {
    let readingTime = 0
    let contentTime = 0
    let readingLength = 0
    let contentLength = 0

    for (const element of this.#elements) {
      const timerProgress = element.readingProgress
      readingTime += element.timer.initialDuration * timerProgress
      contentTime += element.timer.initialDuration
      readingLength += element.charCount * timerProgress
      contentLength += element.charCount
    }

    // Scanning depth is cached incrementally in #handleIntersection
    const scanningDepth = this.#maxScanningDepth
    const contentDepth = document.documentElement.scrollHeight - window.innerHeight
    const readingRatio = contentLength > 0 ? readingLength / contentLength : 0
    const scanningRatio = contentDepth > 0 ? Math.min(1, scanningDepth / contentDepth) : 0

    return {
      readingTime,
      contentTime,
      readingLength,
      contentLength,
      scanningDepth,
      contentDepth,
      readingRatio,
      scanningRatio,
      isActive: this.#isActive,
    }
  }
}
