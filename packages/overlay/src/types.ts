/**
 * Configuration for the engagement metrics overlay.
 */
export interface OverlayConfig {
  /** Whether the overlay is initially enabled. Default: true */
  readonly enabled: boolean

  /** Whether to show the HUD metrics panel. Default: true */
  readonly showHud: boolean

  /** Whether to show per-element color coding. Default: true */
  readonly showElements: boolean

  /** HUD panel position on screen. Default: 'bottom-right' */
  readonly hudPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

  /** Keyboard code for the Ctrl+Shift toggle shortcut. Default: 'KeyD' */
  readonly toggleKey: string
}
