# @kntnt/engagement-metrics-matomo

Matomo Analytics add-on for [`@kntnt/engagement-metrics`](https://www.npmjs.com/package/@kntnt/engagement-metrics). Sends reading and scanning progress events to Matomo at configurable thresholds.

## Installation

```bash
npm install @kntnt/engagement-metrics @kntnt/engagement-metrics-matomo
```

## Usage

### ESM (bundler)

```js
import { createMeasurer } from '@kntnt/engagement-metrics'
import { registerMatomo } from '@kntnt/engagement-metrics-matomo'

const measurer = createMeasurer({ selector: 'article p' })
registerMatomo(measurer, {
  readingThresholds: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
  scanningThresholds: [25, 50, 75, 100],
})
measurer.start()
```

### IIFE (script tag)

```html
<script src="https://unpkg.com/@kntnt/engagement-metrics/dist/kntnt-engagement-metrics.min.js"></script>
<script src="https://unpkg.com/@kntnt/engagement-metrics-matomo/dist/kntnt-engagement-metrics-matomo.min.js"></script>
<script>
  KntntEngagementMetrics.measurer = KntntEngagementMetrics.start({ selector: 'article p' })
  KntntEngagementMetrics.matomo.register()
</script>
```

## Documentation

See the [main repository](https://github.com/Kntnt/kntnt-engagement-metrics) for full documentation, including how to set up Matomo custom dimensions and view engagement data in your Matomo dashboard.

## License

[MIT](https://github.com/Kntnt/kntnt-engagement-metrics/blob/main/LICENSE) — Copyright (c) 2026 Kntnt Sweden AB
