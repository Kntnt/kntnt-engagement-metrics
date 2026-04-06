# @kntnt/engagement-metrics

Lightweight client-side library that measures how deeply users engage with text content on web pages — distinguishing *reading* (pausing on visible content) from *scanning* (scrolling through). Zero runtime dependencies.

## Installation

```bash
npm install @kntnt/engagement-metrics
```

## Usage

### ESM (bundler)

```js
import { createMeasurer } from '@kntnt/engagement-metrics'

const measurer = createMeasurer({
  selector: 'p',
  readingSpeed: 1380,
})

measurer.addListener({
  update(metrics) {
    console.log(`Reading: ${(metrics.readingRatio * 100).toFixed(0)}%`)
  },
})

measurer.start()
```

### IIFE (script tag)

```html
<script src="https://unpkg.com/@kntnt/engagement-metrics/dist/kntnt-engagement-metrics.min.js"></script>
<script>
  KntntEngagementMetrics.measurer = KntntEngagementMetrics.start({ selector: 'article p' })
</script>
```

## Add-ons

Use the core with one or more analytics add-ons:

- [`@kntnt/engagement-metrics-matomo`](https://www.npmjs.com/package/@kntnt/engagement-metrics-matomo) — Matomo Analytics
- [`@kntnt/engagement-metrics-gtag`](https://www.npmjs.com/package/@kntnt/engagement-metrics-gtag) — Google Analytics 4
- [`@kntnt/engagement-metrics-overlay`](https://www.npmjs.com/package/@kntnt/engagement-metrics-overlay) — Visual overlay for debugging and demos

## Documentation

See the [main repository](https://github.com/Kntnt/kntnt-engagement-metrics) for full documentation, configuration options, and the algorithm specification.

## License

[MIT](https://github.com/Kntnt/kntnt-engagement-metrics/blob/main/LICENSE) — Copyright (c) 2026 Kntnt Sweden AB
