import type { EngagementMetrics, MetricsListener } from '@kntnt/engagement-metrics'
import type { MatomoConfig } from './types.js'

/**
 * Matomo analytics listener.
 *
 * Translates engagement metrics into Matomo custom dimensions and events.
 * Reports at configurable thresholds to avoid flooding the tracker.
 */
export class MatomoListener implements MetricsListener {
  readonly #config: MatomoConfig
  readonly #reportedReadingThresholds: Set<number> = new Set()
  readonly #reportedScanningThresholds: Set<number> = new Set()

  constructor(config: MatomoConfig) {
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
        this.#trackEvent('Engagement', 'Reading', `${threshold}%`, Math.round(metrics.readingTime))
      }
    }
  }

  #checkScanningThresholds(metrics: EngagementMetrics): void {
    const scanningPct = metrics.scanningRatio * 100
    for (const threshold of this.#config.scanningThresholds) {
      if (scanningPct >= threshold && !this.#reportedScanningThresholds.has(threshold)) {
        this.#reportedScanningThresholds.add(threshold)
        this.#trackEvent(
          'Engagement',
          'Scanning',
          `${threshold}%`,
          Math.round(metrics.scanningDepth),
        )
      }
    }
  }

  #trackEvent(category: string, action: string, name: string, value: number): void {
    try {
      // Auto-detect Matomo tracker via the standard _paq global
      const _paq = (window as unknown as Record<string, unknown>)._paq as unknown[][] | undefined
      if (_paq) {
        _paq.push(['trackEvent', category, action, name, value])
      } else {
        console.warn('[kntnt-engagement-metrics-matomo] Matomo tracker (_paq) not found')
      }
    } catch (e) {
      console.warn('[kntnt-engagement-metrics-matomo] Failed to send event:', e)
    }
  }
}
