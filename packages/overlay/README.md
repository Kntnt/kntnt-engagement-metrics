# @kntnt/engagement-metrics-overlay

Real-time visual overlay add-on for [`@kntnt/engagement-metrics`](https://www.npmjs.com/package/@kntnt/engagement-metrics). Colour-codes each tracked element by reading state and displays a live metrics panel — useful for debugging, demos, and experimenting with measurement parameters.

## Installation

```bash
npm install @kntnt/engagement-metrics @kntnt/engagement-metrics-overlay
```

## Usage

### ESM (bundler)

```js
import { createMeasurer } from '@kntnt/engagement-metrics'
import { registerOverlay } from '@kntnt/engagement-metrics-overlay'

const measurer = createMeasurer({ selector: 'article p' })
registerOverlay(measurer)
measurer.start()
```

### IIFE (script tag)

```html
<script src="https://unpkg.com/@kntnt/engagement-metrics/dist/kntnt-engagement-metrics.min.js"></script>
<script src="https://unpkg.com/@kntnt/engagement-metrics-overlay/dist/kntnt-engagement-metrics-overlay.min.js"></script>
<script>
  KntntEngagementMetrics.measurer = KntntEngagementMetrics.start({ selector: 'article p' })
  KntntEngagementMetrics.overlay.register()
</script>
```

Toggle the overlay with <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd>.

## Documentation

See the [main repository](https://github.com/Kntnt/kntnt-engagement-metrics) for full documentation.

## License

[MIT](https://github.com/Kntnt/kntnt-engagement-metrics/blob/main/LICENSE) — Copyright (c) 2026 Kntnt Sweden AB
