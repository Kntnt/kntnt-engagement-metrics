/**
 * @kntnt/engagement-metrics-overlay
 *
 * Real-time visual overlay add-on for @kntnt/engagement-metrics.
 * Color-codes tracked elements by reading state and shows a live
 * metrics panel with an interactive reading speed control.
 *
 * @packageDocumentation
 */

import type { Measurer } from '@kntnt/engagement-metrics'
import { EngagementOverlay } from './overlay.js'
import type { OverlayConfig } from './types.js'

export { ElementVisualizer } from './element-visualizer.js'
export { HudPanel } from './hud.js'
export { EngagementOverlay } from './overlay.js'
export type { OverlayConfig } from './types.js'

const DEFAULTS: OverlayConfig = {
  enabled: true,
  showHud: true,
  showElements: true,
  hudPosition: 'bottom-right',
  toggleKey: 'KeyD',
}

/**
 * Register the visual overlay with a measurer.
 *
 * @param measurer - The engagement metrics measurer instance.
 * @param config - Partial overlay configuration (defaults are applied for missing values).
 * @returns The EngagementOverlay instance for programmatic control.
 *
 * @example
 * ```ts
 * import { createMeasurer } from '@kntnt/engagement-metrics'
 * import { registerOverlay } from '@kntnt/engagement-metrics-overlay'
 *
 * const measurer = createMeasurer({ selector: 'article p' })
 * const overlay = registerOverlay(measurer)
 * measurer.start()
 *
 * // Toggle with Ctrl+Shift+D, or programmatically:
 * overlay.toggle()
 * ```
 */
export function registerOverlay(
  measurer: Measurer,
  config?: Partial<OverlayConfig>,
): EngagementOverlay {
  const mergedConfig: OverlayConfig = { ...DEFAULTS, ...config }
  return new EngagementOverlay(measurer, mergedConfig)
}
