/**
 * IIFE entry point for Google Analytics 4 add-on.
 * Auto-registers with the global KntntEngagementMetrics namespace.
 */

import { registerGtag } from './index.js'
import type { GtagConfig } from './types.js'

const ns = (window as Record<string, unknown>).KntntEngagementMetrics as
  | { measurer?: { addListener: (l: unknown) => void }; gtag?: unknown }
  | undefined

if (ns) {
  const config = ((window as Record<string, unknown>).kntntEngagementMetricsGtagConfig ?? {}) as Partial<GtagConfig>
  ns.gtag = { register: (cfg?: Partial<GtagConfig>) => registerGtag(ns.measurer as never, cfg ?? config) }
}
