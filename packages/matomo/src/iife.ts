/**
 * IIFE entry point for Matomo add-on.
 * Auto-registers with the global KntntEngagementMetrics namespace.
 */

import { registerMatomo } from './index.js'
import type { MatomoConfig } from './types.js'

const ns = (window as Record<string, unknown>).KntntEngagementMetrics as
  | { measurer?: { addListener: (l: unknown) => void }; matomo?: unknown }
  | undefined

if (ns) {
  const config = ((window as Record<string, unknown>).kntntEngagementMetricsMatomoConfig ?? {}) as Partial<MatomoConfig>
  ns.matomo = { register: (cfg?: Partial<MatomoConfig>) => registerMatomo(ns.measurer as never, cfg ?? config) }
}
