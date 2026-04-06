# API contracts

This document defines the public API surface for all packages. Everything not listed here is considered internal and may change without notice.

## Core: @kntnt/engagement-metrics

### Factory function

```typescript
function createMeasurer(config?: Partial<MeasurerConfig>): Measurer
```

Creates a new `Measurer` instance with the given configuration merged with defaults.

### Measurer class

```typescript
class Measurer {
  /** Start measuring. Call after DOM is ready. */
  start(): void

  /** Stop measuring and clean up observers/listeners. */
  stop(): void

  /** Register a metrics listener. */
  addListener(listener: MetricsListener): void

  /** Remove a previously registered listener. */
  removeListener(listener: MetricsListener): void

  /** Get the current metrics snapshot (without waiting for next tick). */
  getMetrics(): EngagementMetrics

  /** Expose tracked elements for visualization or diagnostic purposes. */
  getElements(): ReadonlyArray<TrackedElement>

  /**
   * Change the reading speed and recalibrate all timers, preserving progress.
   * Non-positive, NaN, and Infinity values are silently ignored (a warning is logged).
   */
  setReadingSpeed(charsPerMinute: number): void

  /**
   * Change the scroll cooldown duration at runtime.
   * Negative, NaN, and Infinity values are silently ignored (a warning is logged).
   * Zero disables the cooldown (reading resumes immediately after scrolling stops).
   */
  setScrollCooldown(ms: number): void

  /**
   * Change the scroll speed threshold at runtime.
   * Non-positive, NaN, and Infinity values are silently ignored (a warning is logged).
   */
  setScrollSpeedThreshold(pxPerSec: number): void

  /** True if measurement is currently running. */
  readonly isActive: boolean
}
```

### Configuration type

```typescript
interface MeasurerConfig {
  selector: string              // Default: 'p'
  exclude: string               // Default: '' (no exclusions)
  readingSpeed: number          // Default: 1380 (chars/min)
  tickInterval: number          // Default: 200 (ms)
  observerThresholds: number[]  // Default: [0, 0.25, 0.5, 0.75, 1.0]
  scrollSpeedThreshold: number  // Default: 200 (px/sec)
  scrollCooldown: number        // Default: 50 (ms)
}
```

**`selector`** selects which elements to measure. **`exclude`** is a CSS selector that filters out unwanted elements: any element matched by `selector` is excluded if it matches `exclude` itself or has an ancestor that matches `exclude`. This lets users target broad content selectors while excluding sidebars, navigation, footers, and other non-content areas. When `exclude` is an empty string (the default), no filtering occurs.

Example:

```typescript
createMeasurer({
  selector: '#content :is(h1, h2, h3, p, ul, ol)',
  exclude: '.sidebar, .footer, .table-of-contents',
})
```

### Metrics type

```typescript
interface EngagementMetrics {
  readingTime: number      // seconds
  contentTime: number      // seconds
  readingLength: number    // characters
  contentLength: number    // characters
  scanningDepth: number    // pixels
  contentDepth: number     // pixels
  readingRatio: number     // 0–1
  scanningRatio: number    // 0–1
  isActive: boolean
}
```

### TrackedElement interface

```typescript
interface TrackedElement {
  /** The DOM element being tracked. */
  readonly node: Element

  /** The countdown timer for this element's estimated reading time. */
  readonly timer: Timer

  /** Number of characters in the element's text content. */
  readonly charCount: number

  /** Fraction (0–1) of the element currently visible in the viewport. */
  readonly visibilityRatio: number

  /** True once the element has been scrolled into view at least once. */
  readonly hasBeenSeen: boolean

  /** True when the element's reading timer has reached zero. */
  readonly isFullyRead: boolean

  /** Reading progress (0–1), derived from the timer's progress. */
  readonly readingProgress: number

  /** Update visibility state from an IntersectionObserver entry. */
  updateVisibility(entry: IntersectionObserverEntry): void
}
```

### Listener interface

```typescript
interface MetricsListener {
  update(metrics: EngagementMetrics): void
}
```

### IIFE global

When loaded via `<script>` tag, the IIFE build exposes:

```typescript
window.KntntEngagementMetrics = {
  createMeasurer: (config?) => Measurer,
  start: (config?) => Measurer,   // Convenience: create + start + return measurer
  version: string,
  measurer: Measurer | null        // Initially null — see note below
}
```

**`measurer` property:** The `start()` convenience function creates and starts a measurer, then returns it, but does **not** automatically assign it to the namespace. To make the measurer available for add-on IIFE scripts that look for it on the namespace, assign it explicitly:

```javascript
KntntEngagementMetrics.measurer = KntntEngagementMetrics.start({ /* config */ })
```

**Double-load protection:** The IIFE entry point guards against being loaded more than once. If the `window.KntntEngagementMetrics` namespace already exists, the duplicate script logs a warning and is skipped.

## Matomo add-on: @kntnt/engagement-metrics-matomo

### Registration function

```typescript
function registerMatomo(measurer: Measurer, config?: Partial<MatomoConfig>): void
```

### Configuration type

```typescript
interface MatomoConfig {
  /** Matomo custom dimension ID for reading ratio. */
  readingRatioDimension?: number

  /** Matomo custom dimension ID for scanning ratio. */
  scanningRatioDimension?: number

  /** Matomo custom dimension ID for reading time. */
  readingTimeDimension?: number

  /** Reading ratio threshold (0–1) below which the visit is considered a bounce. Default: 0.1 */
  bounceThreshold: number

  /** Reporting thresholds for reading ratio (percentages). Default: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100] */
  readingThresholds: number[]

  /** Reporting thresholds for scanning ratio (percentages). Default: [25, 50, 75, 100] */
  scanningThresholds: number[]

  /** How to detect the Matomo tracker. Default: 'auto' */
  trackerMode: 'auto' | 'matomo' | 'dataLayer'
}
```

### IIFE global

```typescript
window.KntntEngagementMetrics.matomo = {
  register: (config?) => void   // Auto-registers with the global measurer
}
```

**Double-load protection:** If the `.matomo` namespace property already exists, the duplicate script logs a warning and is skipped.

## Google Analytics 4 add-on: @kntnt/engagement-metrics-gtag

### Registration function

```typescript
function registerGtag(measurer: Measurer, config?: Partial<GtagConfig>): void
```

### Configuration type

```typescript
interface GtagConfig {
  /** GA4 event name for reading progress. Default: 'engagement_reading' */
  readingEventName: string

  /** GA4 event name for scanning progress. Default: 'engagement_scanning' */
  scanningEventName: string

  /** Reporting thresholds for reading ratio (percentages). Default: [10, 25, 50, 75, 90, 100] */
  readingThresholds: number[]

  /** Reporting thresholds for scanning ratio (percentages). Default: [25, 50, 75, 100] */
  scanningThresholds: number[]

  /** How to detect gtag. Default: 'auto' */
  trackerMode: 'auto' | 'gtag' | 'dataLayer'
}
```

### IIFE global

```typescript
window.KntntEngagementMetrics.gtag = {
  register: (config?) => void   // Auto-registers with the global measurer
}
```

**Double-load protection:** If the `.gtag` namespace property already exists, the duplicate script logs a warning and is skipped.

## Visual overlay add-on: @kntnt/engagement-metrics-overlay

### Registration function

```typescript
function registerOverlay(measurer: Measurer, config?: Partial<OverlayConfig>): EngagementOverlay
```

Returns the `EngagementOverlay` instance for programmatic control (unlike the analytics add-ons which return `void`).

### Configuration type

```typescript
interface OverlayConfig {
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
```

### EngagementOverlay class

```typescript
class EngagementOverlay implements MetricsListener {
  /** Called on every measurement tick with a fresh metrics snapshot. */
  update(metrics: EngagementMetrics): void

  /** Toggle the overlay on or off. */
  toggle(): void

  /** Enable the overlay, creating the HUD and element visualizer. */
  enable(): void

  /** Disable the overlay, restoring element styles and hiding the HUD. */
  disable(): void

  /** Fully tear down the overlay: remove listener, keyboard handler, and DOM elements. */
  destroy(): void
}
```

### Element color coding

| State | Condition | Visual indicator |
|-------|-----------|-----------------|
| Unseen | Not yet scrolled into view | Blue outline |
| Running | Visible and being read | Gold outline + yellow gradient showing reading progress |
| Paused | Previously seen but no longer visible | Red outline |
| Finished | Fully read | Green outline + light green background |

### HUD panel

The HUD panel displays live metrics (reading %, scanning %, element counts, status) and includes interactive controls for tuning measurement parameters:

- **Reading speed** — range slider (50–5,000 cpm) and numeric input. Changes take effect immediately via `measurer.setReadingSpeed()`.
- **Scroll cooldown** — range slider (0–2,000 ms) and numeric input. Changes take effect immediately via `measurer.setScrollCooldown()`.
- **Scroll speed threshold** — range slider (10–500 px/s) and numeric input. Changes take effect immediately via `measurer.setScrollSpeedThreshold()`.

Slider controls use fixed step increments (50/50/10). Numeric inputs accept free-form typing and apply the value on blur or Enter (clamped to the valid range).

Toggle the overlay with `Ctrl+Shift+D` (configurable).

### IIFE global

```typescript
window.KntntEngagementMetrics.overlay = {
  register: (config?) => EngagementOverlay   // Auto-registers with the global measurer
}
```

**Double-load protection:** If the `.overlay` namespace property already exists, the duplicate script logs a warning and is skipped.
