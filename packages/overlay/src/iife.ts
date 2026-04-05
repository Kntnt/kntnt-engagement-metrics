/**
 * IIFE entry point for the overlay add-on.
 * Auto-registers with the global KntntEngagementMetrics namespace.
 */

import { registerOverlay } from './index.js'
import type { OverlayConfig } from './types.js'

const ns = (window as unknown as Record<string, unknown>).KntntEngagementMetrics as
  | {
      measurer?: { addListener: (l: unknown) => void; getElements: () => unknown }
      overlay?: unknown
    }
  | undefined

if (ns) {
  const config = ((window as unknown as Record<string, unknown>)
    .kntntEngagementMetricsOverlayConfig ?? {}) as Partial<OverlayConfig>
  ns.overlay = {
    register: (cfg?: Partial<OverlayConfig>) =>
      registerOverlay(ns.measurer as never, cfg ?? config),
  }
}
