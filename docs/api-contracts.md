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

  /** True if measurement is currently running. */
  readonly isActive: boolean
}
```

### Configuration type

```typescript
interface MeasurerConfig {
  selector: string              // Default: 'p'
  exclude: string               // Default: '' (no exclusions)
  readingSpeed: number          // Default: 863 (chars/min)
  tickInterval: number          // Default: 200 (ms)
  observerThresholds: number[]  // Default: [0, 0.25, 0.5, 0.75, 1.0]
  scrollSpeedThreshold: number  // Default: 50 (px/sec)
  scrollCooldown: number        // Default: 500 (ms)
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
  measurer: Measurer | null        // Populated after start() is called
}
```

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
