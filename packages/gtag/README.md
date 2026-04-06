# @kntnt/engagement-metrics-gtag

Google Analytics 4 (gtag.js) add-on for [`@kntnt/engagement-metrics`](https://www.npmjs.com/package/@kntnt/engagement-metrics). Sends reading and scanning progress events to GA4 at configurable thresholds.

## Installation

```bash
npm install @kntnt/engagement-metrics @kntnt/engagement-metrics-gtag
```

## Usage

### ESM (bundler)

```js
import { createMeasurer } from '@kntnt/engagement-metrics'
import { registerGtag } from '@kntnt/engagement-metrics-gtag'

const measurer = createMeasurer({ selector: 'article p' })
registerGtag(measurer, {
  readingThresholds: [10, 25, 50, 75, 90, 100],
  scanningThresholds: [25, 50, 75, 100],
})
measurer.start()
```

### IIFE (script tag)

```html
<script src="https://unpkg.com/@kntnt/engagement-metrics/dist/kntnt-engagement-metrics.min.js"></script>
<script src="https://unpkg.com/@kntnt/engagement-metrics-gtag/dist/kntnt-engagement-metrics-gtag.min.js"></script>
<script>
  KntntEngagementMetrics.measurer = KntntEngagementMetrics.start({ selector: 'article p' })
  KntntEngagementMetrics.gtag.register()
</script>
```

## Documentation

See the [main repository](https://github.com/Kntnt/kntnt-engagement-metrics) for full documentation, including how to register custom dimensions in GA4 and view engagement data in your reports.

## License

[MIT](https://github.com/Kntnt/kntnt-engagement-metrics/blob/main/LICENSE) — Copyright (c) 2026 Kntnt Sweden AB
