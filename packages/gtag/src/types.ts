/**
 * Configuration for the Google Analytics 4 (gtag.js) add-on.
 */
export interface GtagConfig {
  /** GA4 event name for reading progress. Default: `'engagement_reading'` */
  readonly readingEventName: string

  /** GA4 event name for scanning progress. Default: `'engagement_scanning'` */
  readonly scanningEventName: string

  /** Reporting thresholds for reading ratio (percentages). Default: `[10, 25, 50, 75, 90, 100]` */
  readonly readingThresholds: number[]

  /** Reporting thresholds for scanning ratio (percentages). Default: `[25, 50, 75, 100]` */
  readonly scanningThresholds: number[]

  /** How to detect gtag: `'auto'` | `'gtag'` | `'dataLayer'`. Default: `'auto'` */
  readonly trackerMode: 'auto' | 'gtag' | 'dataLayer'
}
