/**
 * @kntnt/engagement-metrics-matomo
 *
 * Matomo Analytics add-on for @kntnt/engagement-metrics.
 *
 * @packageDocumentation
 */

import type { Measurer } from '@kntnt/engagement-metrics'
import { MatomoListener } from './listener.js'
import type { MatomoConfig } from './types.js'

export { MatomoListener } from './listener.js'
export type { MatomoConfig } from './types.js'

const DEFAULTS: MatomoConfig = {
  bounceThreshold: 0.1,
  readingThresholds: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
  scanningThresholds: [25, 50, 75, 100],
  trackerMode: 'auto',
}

/**
 * Register the Matomo analytics listener with a measurer.
 *
 * @param measurer - The engagement metrics measurer instance.
 * @param config - Partial Matomo configuration (defaults are applied for missing values).
 *
 * @example
 * ```ts
 * import { createMeasurer } from '@kntnt/engagement-metrics'
 * import { registerMatomo } from '@kntnt/engagement-metrics-matomo'
 *
 * const measurer = createMeasurer()
 * registerMatomo(measurer, { readingRatioDimension: 1 })
 * measurer.start()
 * ```
 */
export function registerMatomo(measurer: Measurer, config?: Partial<MatomoConfig>): void {
  const mergedConfig: MatomoConfig = { ...DEFAULTS, ...config }
  const listener = new MatomoListener(mergedConfig)
  measurer.addListener(listener)
}
