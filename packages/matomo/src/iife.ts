/**
 * IIFE entry point for Matomo add-on.
 * Auto-registers with the global KntntEngagementMetrics namespace.
 */

import { registerMatomo } from './index.js'
import type { MatomoConfig } from './types.js'

const ns = (window as unknown as Record<string, unknown>).KntntEngagementMetrics as
  | { measurer?: { addListener: (l: unknown) => void }; matomo?: unknown }
  | undefined

if (ns) {
  if (ns.matomo) {
    console.warn('[kntnt-engagement-metrics-matomo] Already loaded, skipping')
  } else {
    const config = ((window as unknown as Record<string, unknown>)
      .kntntEngagementMetricsMatomoConfig ?? {}) as Partial<MatomoConfig>
    ns.matomo = {
      register: (cfg?: Partial<MatomoConfig>) =>
        registerMatomo(ns.measurer as never, cfg ?? config),
    }
  }
} else {
  console.warn('[kntnt-engagement-metrics-matomo] Core library not loaded')
}
