import type { EngagementMetrics, Measurer, MetricsListener } from '@kntnt/engagement-metrics'
import { ElementVisualizer } from './element-visualizer.js'
import { HudPanel } from './hud.js'
import type { OverlayConfig } from './types.js'

/**
 * Real-time visual overlay for engagement metrics.
 *
 * Color-codes tracked content elements by reading state and shows a live
 * metrics panel with an interactive reading speed control. Implements
 * MetricsListener to receive updates on every measurement tick.
 */
export class EngagementOverlay implements MetricsListener {
  readonly #config: OverlayConfig
  readonly #measurer: Measurer
  #hud: HudPanel | null = null
  #visualizer: ElementVisualizer | null = null
  #enabled = false
  #keydownHandler: ((e: KeyboardEvent) => void) | null = null

  constructor(measurer: Measurer, config: OverlayConfig) {
    this.#config = config
    this.#measurer = measurer

    // Register as a metrics listener
    measurer.addListener(this)

    // Set up keyboard toggle
    this.#keydownHandler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.code === this.#config.toggleKey) {
        e.preventDefault()
        this.toggle()
      }
    }
    document.addEventListener('keydown', this.#keydownHandler)

    // Enable immediately if configured to start active
    if (config.enabled) {
      this.enable()
    }
  }

  /** Called on every measurement tick with a fresh metrics snapshot. */
  update(metrics: EngagementMetrics): void {
    if (!this.#enabled) return

    const elements = this.#measurer.getElements()

    if (this.#config.showElements) {
      this.#visualizer?.apply()
    }

    if (this.#config.showHud) {
      this.#hud?.update(metrics, elements)
    }
  }

  /** Toggle the overlay on or off. */
  toggle(): void {
    if (this.#enabled) {
      this.disable()
    } else {
      this.enable()
    }
  }

  /** Enable the overlay, creating the HUD and element visualizer. */
  enable(): void {
    if (this.#enabled) return
    this.#enabled = true

    const elements = this.#measurer.getElements()

    if (this.#config.showElements) {
      this.#visualizer = new ElementVisualizer(elements)
      this.#visualizer.apply()
    }

    if (this.#config.showHud) {
      this.#hud = new HudPanel(this.#config.hudPosition, this.#measurer, this.#config.toggleKey)
    }
  }

  /** Disable the overlay, restoring element styles and hiding the HUD. */
  disable(): void {
    if (!this.#enabled) return
    this.#enabled = false

    this.#visualizer?.cleanup()
    this.#visualizer = null

    this.#hud?.destroy()
    this.#hud = null
  }

  /** Fully tear down the overlay: remove listener, keyboard handler, and DOM elements. */
  destroy(): void {
    this.disable()

    this.#measurer.removeListener(this)

    if (this.#keydownHandler) {
      document.removeEventListener('keydown', this.#keydownHandler)
      this.#keydownHandler = null
    }
  }
}
