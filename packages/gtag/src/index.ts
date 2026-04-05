/**
 * @kntnt/engagement-metrics-gtag
 *
 * Google Analytics 4 (gtag.js) add-on for @kntnt/engagement-metrics.
 *
 * @packageDocumentation
 */

import type { Measurer } from '@kntnt/engagement-metrics'
import { GtagListener } from './listener.js'
import type { GtagConfig } from './types.js'

export { GtagListener } from './listener.js'
export type { GtagConfig } from './types.js'

const DEFAULTS: GtagConfig = {
  readingEventName: 'engagement_reading',
  scanningEventName: 'engagement_scanning',
  readingThresholds: [10, 25, 50, 75, 90, 100],
  scanningThresholds: [25, 50, 75, 100],
  trackerMode: 'auto',
}

/**
 * Register the Google Analytics 4 listener with a measurer.
 *
 * @param measurer - The engagement metrics measurer instance.
 * @param config - Partial GA4 configuration (defaults are applied for missing values).
 *
 * @example
 * ```ts
 * import { createMeasurer } from '@kntnt/engagement-metrics'
 * import { registerGtag } from '@kntnt/engagement-metrics-gtag'
 *
 * const measurer = createMeasurer()
 * registerGtag(measurer, { readingThresholds: [25, 50, 75, 100] })
 * measurer.start()
 * ```
 */
export function registerGtag(measurer: Measurer, config?: Partial<GtagConfig>): void {
  const mergedConfig: GtagConfig = { ...DEFAULTS, ...config }
  const listener = new GtagListener(mergedConfig)
  measurer.addListener(listener)
}
