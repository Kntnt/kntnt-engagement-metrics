/**
 * IIFE entry point for browser script-tag usage.
 * Exposes `window.KntntEngagementMetrics` global namespace.
 */

import { version as VERSION } from '../package.json'
import { Measurer } from './measurer.js'
import type { MeasurerConfig } from './types.js'

function createMeasurer(config?: Partial<MeasurerConfig>): Measurer {
  return new Measurer(config)
}

/**
 * Convenience: create a measurer, start it, and return it.
 */
function start(config?: Partial<MeasurerConfig>): Measurer {
  const measurer = createMeasurer(config)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => measurer.start())
  } else {
    measurer.start()
  }
  return measurer
}

// Expose on the global namespace (guard against double-load)
const existing = (window as unknown as Record<string, unknown>).KntntEngagementMetrics
if (existing) {
  console.warn('[kntnt-engagement-metrics] Already loaded, skipping duplicate initialization')
} else {
  const ns = {
    createMeasurer,
    start,
    version: VERSION,
    measurer: null as Measurer | null,
  }
  ;(window as unknown as Record<string, unknown>).KntntEngagementMetrics = ns
}
