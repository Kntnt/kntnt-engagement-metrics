import type { EngagementMetrics, MetricsListener } from '@kntnt/engagement-metrics'
import type { GtagConfig } from './types.js'

/**
 * Google Analytics 4 (gtag.js) listener.
 *
 * Translates engagement metrics into GA4 custom events.
 * Reports at configurable thresholds to avoid flooding the tracker.
 */
export class GtagListener implements MetricsListener {
  readonly #config: GtagConfig
  readonly #reportedReadingThresholds: Set<number> = new Set()
  readonly #reportedScanningThresholds: Set<number> = new Set()

  constructor(config: GtagConfig) {
    this.#config = config
  }

  update(metrics: EngagementMetrics): void {
    this.#checkReadingThresholds(metrics)
    this.#checkScanningThresholds(metrics)
  }

  #checkReadingThresholds(metrics: EngagementMetrics): void {
    const readingPct = metrics.readingRatio * 100
    for (const threshold of this.#config.readingThresholds) {
      if (readingPct >= threshold && !this.#reportedReadingThresholds.has(threshold)) {
        this.#reportedReadingThresholds.add(threshold)
        this.#sendEvent(this.#config.readingEventName, {
          percentage: threshold,
          reading_time: Math.round(metrics.readingTime),
          reading_ratio: Math.round(metrics.readingRatio * 100),
        })
      }
    }
  }

  #checkScanningThresholds(metrics: EngagementMetrics): void {
    const scanningPct = metrics.scanningRatio * 100
    for (const threshold of this.#config.scanningThresholds) {
      if (scanningPct >= threshold && !this.#reportedScanningThresholds.has(threshold)) {
        this.#reportedScanningThresholds.add(threshold)
        this.#sendEvent(this.#config.scanningEventName, {
          percentage: threshold,
          scanning_depth: Math.round(metrics.scanningDepth),
          scanning_ratio: Math.round(metrics.scanningRatio * 100),
        })
      }
    }
  }

  #sendEvent(eventName: string, params: Record<string, unknown>): void {
    try {
      const gtag = (window as unknown as Record<string, unknown>).gtag as
        | ((...args: unknown[]) => void)
        | undefined

      if (typeof gtag === 'function') {
        gtag('event', eventName, params)
      } else {
        console.warn('[kntnt-engagement-metrics-gtag] gtag function not found')
      }
    } catch (e) {
      console.warn('[kntnt-engagement-metrics-gtag] Failed to send event:', e)
    }
  }
}
