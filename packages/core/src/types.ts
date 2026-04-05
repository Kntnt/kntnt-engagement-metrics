/**
 * Configuration for the engagement metrics measurer.
 * All fields are optional — defaults are applied for missing values.
 */
export interface MeasurerConfig {
  /** CSS selector for content elements. Default: `'p'` */
  readonly selector: string

  /** CSS selector for elements to exclude. Any element matched by `selector` is excluded if it matches `exclude` itself or has an ancestor matching `exclude`. Default: `''` (no exclusions) */
  readonly exclude: string

  /** Average reading speed in characters per minute. Default: `863` */
  readonly readingSpeed: number

  /** Milliseconds between measurement ticks. Default: `200` */
  readonly tickInterval: number

  /** IntersectionObserver threshold steps (array of ratios 0–1). Default: `[0, 0.25, 0.5, 0.75, 1.0]` */
  readonly observerThresholds: number[]

  /** Minimum scroll speed (px/sec) to count as active scrolling. Default: `50` */
  readonly scrollSpeedThreshold: number

  /** Milliseconds after last scroll event before reading resumes. Default: `500` */
  readonly scrollCooldown: number
}

/**
 * Snapshot of engagement metrics at a point in time.
 */
export interface EngagementMetrics {
  /** Estimated seconds of actual reading so far. */
  readonly readingTime: number

  /** Total estimated reading time for all content (seconds). */
  readonly contentTime: number

  /** Estimated characters read so far. */
  readonly readingLength: number

  /** Total characters across all content elements. */
  readonly contentLength: number

  /** Maximum vertical scroll position reached (pixels). */
  readonly scanningDepth: number

  /** Total scrollable content height (pixels). */
  readonly contentDepth: number

  /** `readingLength / contentLength` (0–1). */
  readonly readingRatio: number

  /** `scanningDepth / contentDepth` (0–1, capped at 1). */
  readonly scanningRatio: number

  /** True if measurement is still running. */
  readonly isActive: boolean
}

/**
 * Interface for consumers of engagement metrics.
 * Implement this to receive metric updates on each measurement tick.
 */
export interface MetricsListener {
  /** Called on each measurement tick with a fresh metrics snapshot. */
  update(metrics: EngagementMetrics): void
}
