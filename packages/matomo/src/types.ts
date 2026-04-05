/**
 * Configuration for the Matomo analytics add-on.
 */
export interface MatomoConfig {
  /** Matomo custom dimension ID for reading ratio. */
  readonly readingRatioDimension?: number

  /** Matomo custom dimension ID for scanning ratio. */
  readonly scanningRatioDimension?: number

  /** Matomo custom dimension ID for reading time. */
  readonly readingTimeDimension?: number

  /** Reading ratio threshold (0–1) below which the visit is considered a bounce. Default: `0.1` */
  readonly bounceThreshold: number

  /** Reporting thresholds for reading ratio (percentages). Default: `[10, 20, 30, 40, 50, 60, 70, 80, 90, 100]` */
  readonly readingThresholds: number[]

  /** Reporting thresholds for scanning ratio (percentages). Default: `[25, 50, 75, 100]` */
  readonly scanningThresholds: number[]

  /** How to detect the Matomo tracker: `'auto'` | `'matomo'` | `'dataLayer'`. Default: `'auto'` */
  readonly trackerMode: 'auto' | 'matomo' | 'dataLayer'
}
