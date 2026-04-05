/**
 * @kntnt/engagement-metrics
 *
 * Lightweight library that measures how deeply users engage with
 * content on web pages — reading vs. scanning, time spent, and
 * completion rate.
 *
 * @packageDocumentation
 */

import { Measurer } from './measurer.js'
import type { MeasurerConfig } from './types.js'

export { Measurer } from './measurer.js'
export type { EngagementMetrics, MeasurerConfig, MetricsListener } from './types.js'

/**
 * Convenience factory function that creates a new Measurer instance.
 *
 * @param config - Partial configuration (defaults are applied for missing values).
 * @returns A new Measurer instance, ready to be started.
 *
 * @example
 * ```ts
 * import { createMeasurer } from '@kntnt/engagement-metrics'
 *
 * const measurer = createMeasurer({ selector: 'article p' })
 * measurer.start()
 * ```
 */
export function createMeasurer(config?: Partial<MeasurerConfig>): Measurer {
  return new Measurer(config)
}
