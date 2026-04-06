# Kntnt Engagement Metrics

**Did they actually read it — or just scroll past?**

You spend hours crafting content. Your analytics say 5,000 people visited the page. But how many of them actually *read* what you wrote? Your analytics tool can't tell you. It counts pageviews and time on page — but a visitor who scrolls to the bottom in 3 seconds looks the same as one who reads every word for 5 minutes.

Kntnt Engagement Metrics answers the question your analytics can't: **how much of your content did people actually engage with?**

It's a tiny JavaScript library that runs silently on your pages. It watches what visitors do — which paragraphs are visible, how long they linger, how fast they scroll — and from that, it estimates how much they actually read versus how much they merely scrolled past. The results are sent to your analytics platform (Matomo, Google Analytics, or others) so you can see exactly which content truly engages your audience.

The library is open source, lightweight (< 4 KB), has zero dependencies, and is designed to impose near-zero performance overhead on your visitors.

## Live demo

**[Try the live demo](https://kntnt.github.io/kntnt-engagement-metrics/)** — a long-read article with the core library and overlay add-on running on it. Scroll and read the article. The overlay color-codes each paragraph by reading state and shows live metrics in a panel at the bottom-right corner. Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd> to toggle the overlay on and off.

You can also run the demo locally by cloning the repository, building the project, and opening `demo.html` in your browser:

```bash
git clone https://github.com/Kntnt/kntnt-engagement-metrics.git
cd kntnt-engagement-metrics
bun install && bun run build
open demo.html  # or just double-click the file
```

## How it works

The library distinguishes between two behaviours:

- **Reading** — the visitor pauses on a paragraph long enough to actually read it. The library estimates reading time based on text length and average reading speed.
- **Scanning** — the visitor scrolls a paragraph into view but moves on without reading it.

From these observations, it produces metrics like *reading ratio* (what fraction of the content was actually read), *scanning ratio* (how far down the page the visitor got), and *estimated reading time*. These metrics are reported at configurable thresholds to your analytics platform via add-ons — for example, "this visitor read 75% of the article".

## Packages

| Package | Description |
|---------|-------------|
| [`@kntnt/engagement-metrics`](packages/core) | Core measurement library (zero dependencies) |
| [`@kntnt/engagement-metrics-matomo`](packages/matomo) | Matomo Analytics add-on |
| [`@kntnt/engagement-metrics-gtag`](packages/gtag) | Google Analytics 4 (gtag.js) add-on |
| [`@kntnt/engagement-metrics-overlay`](packages/overlay) | Real-time visual overlay showing measurement in action |

## Quick start

### Using a bundler (ESM)

```bash
bun add @kntnt/engagement-metrics @kntnt/engagement-metrics-gtag
```

```js
import { createMeasurer } from '@kntnt/engagement-metrics'
import { registerGtag } from '@kntnt/engagement-metrics-gtag'

const measurer = createMeasurer({
  selector: 'p',        // measure all <p> elements
  readingSpeed: 882,     // characters per minute
})

registerGtag(measurer, {
  readingThresholds: [10, 25, 50, 75, 100],
})

measurer.start()
```

### Using script tags (IIFE)

The packages are not yet published to npm or a CDN. To use them, you build the files yourself:

1. Install [Bun](https://bun.sh/) if you don't have it (it's a JavaScript toolkit, similar to Node.js):
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```
2. Download and build the project:
   ```bash
   git clone https://github.com/Kntnt/kntnt-engagement-metrics.git
   cd kntnt-engagement-metrics
   bun install
   bun run build
   ```
3. Copy the built files to your website. They are located at:
   - `packages/core/dist/kntnt-engagement-metrics.min.js`
   - `packages/matomo/dist/kntnt-engagement-metrics-matomo.min.js` (if using Matomo)
   - `packages/gtag/dist/kntnt-engagement-metrics-gtag.min.js` (if using Google Analytics)
   - `packages/overlay/dist/kntnt-engagement-metrics-overlay.min.js` (if using the visual overlay)

4. Add the scripts to your HTML:

```html
<script src="/path/to/kntnt-engagement-metrics.min.js"></script>
<script src="/path/to/kntnt-engagement-metrics-gtag.min.js"></script>
<script>
  const measurer = KntntEngagementMetrics.start({
    selector: 'article p',
    readingSpeed: 882,
  })
  KntntEngagementMetrics.measurer = measurer
  KntntEngagementMetrics.gtag.register()
</script>
```

## Visual overlay

Want to see the library in action? The overlay add-on shows measurement happening in real-time, directly on the page. It color-codes each tracked element by reading state and displays a live metrics panel with an interactive reading speed control — useful for understanding what is being measured and for experimenting with different reading speed settings.

**What you see:**
- **Blue** outline — element not yet scrolled into view
- **Gold** outline with yellow gradient — element currently being read (gradient shows progress)
- **Green** outline and background — element fully read
- **Red** outline — element previously seen but no longer visible (paused)

### Using a bundler (ESM)

```js
import { createMeasurer } from '@kntnt/engagement-metrics'
import { registerOverlay } from '@kntnt/engagement-metrics-overlay'

const measurer = createMeasurer({ selector: 'article p' })
const overlay = registerOverlay(measurer)
measurer.start()

// Toggle with Ctrl+Shift+D, or programmatically:
// overlay.toggle() / overlay.disable() / overlay.destroy()
```

### Using script tags (IIFE)

```html
<script src="/path/to/kntnt-engagement-metrics.min.js"></script>
<script src="/path/to/kntnt-engagement-metrics-overlay.min.js"></script>
<script>
  const measurer = KntntEngagementMetrics.start({ selector: 'article p' })
  KntntEngagementMetrics.measurer = measurer
  KntntEngagementMetrics.overlay.register()
</script>
```

The HUD panel includes a reading speed slider (100–3000 characters per minute) that recalibrates all timers instantly, letting you find the right speed for your content.

## How it works

1. The library finds all content elements matching a CSS selector (default: `<p>` tags).
2. An `IntersectionObserver` tracks which elements are visible in the viewport.
3. A lightweight tick loop advances reading for one element at a time — the topmost unfinished visible paragraph — modelling a human reader who reads top to bottom. Reading progress within each element is capped at its visible boundary.
4. Reading timers pause during active scrolling and when the browser tab is hidden.
5. Metrics are emitted on each tick to registered listeners (analytics add-ons).

For the full algorithm specification, see [`docs/algorithm.md`](docs/algorithm.md). For architecture and design principles, see [`docs/architecture.md`](docs/architecture.md).

## Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `readingTime` | seconds | Estimated time spent reading so far |
| `contentTime` | seconds | Total estimated reading time for all content |
| `readingLength` | characters | Estimated number of characters read |
| `contentLength` | characters | Total characters across all content elements |
| `scanningDepth` | pixels | Deepest scroll position reached |
| `contentDepth` | pixels | Total scrollable content height |
| `readingRatio` | 0–1 | Fraction of content actually read |
| `scanningRatio` | 0–1 | Fraction of content scrolled through |

## Configuration

```js
createMeasurer({
  selector: 'p',                               // CSS selector for content elements
  exclude: '',                                 // CSS selector for elements to exclude
  readingSpeed: 882,                           // characters per minute
  tickInterval: 200,                           // ms between measurement ticks
  observerThresholds: [0, 0.25, 0.5, 0.75, 1], // IntersectionObserver thresholds
  scrollSpeedThreshold: 50,                    // px/sec to count as scrolling
  scrollCooldown: 500,                         // ms after last scroll before reading resumes
})
```

All options are optional. Defaults are shown above. The mean reading speed across 14 of the 17 languages studied in the International Reading Speed Texts (IReST) project is 882 characters per minute. Reading speeds in the IReST project ranged from 65 to 71 milliseconds per character with a 95% confidence interval (Trauzettel-Klosinski S, Dietz K; IReST Study Group, "[Standardized Assessment of Reading Performance: The New International Reading Speed Texts IReST](https://doi.org/10.1167/iovs.11-8284)", *Invest Ophthalmol Vis Sci.* 2012;53(9):5452–5461). For the complete API reference, see [`docs/api-contracts.md`](docs/api-contracts.md).

## Building an add-on

Add-ons implement the `MetricsListener` interface and register with a `Measurer`:

```typescript
import type { MetricsListener, EngagementMetrics } from '@kntnt/engagement-metrics'

class MyListener implements MetricsListener {
  update(metrics: EngagementMetrics): void {
    // Send metrics to your analytics platform
  }
}
```

See the [add-on development guide](docs/addon-development.md) for full instructions.

## Development

### Prerequisites

- [Bun](https://bun.sh/) (latest version)

### Setup

```bash
git clone https://github.com/Kntnt/kntnt-engagement-metrics.git
cd kntnt-engagement-metrics
bun install
```

### Commands

```bash
bun run build        # Build all packages
bun test             # Run tests
bun run test:e2e     # Run end-to-end tests (Playwright)
bun run lint         # Lint with Biome
bun run typecheck    # Type-check with TypeScript
```

## Contributing

Contributions are welcome. Before submitting a pull request, please read the [coding conventions](docs/coding-conventions.md), [testing strategy](docs/testing-strategy.md), and [CI and hooks setup](docs/ci-and-hooks.md).

## License

[MIT](LICENSE) — Copyright (c) 2026 Kntnt Sweden AB
