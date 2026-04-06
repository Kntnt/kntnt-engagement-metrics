# Kntnt Engagement Metrics

A JavaScript library that estimates how much of the content a visitor has likely read.

## Description

You spend hours crafting content. Your analytics say 5,000 people visited the page. But how many of them actually *read* what you wrote? Your analytics tool can't tell you. It counts pageviews and time on page — but a visitor who scrolls to the bottom in 3 seconds looks the same as one who reads every word for 5 minutes.

Kntnt Engagement Metrics answers the question your analytics can't: **how much of your content did people actually engage with?**

It's a tiny JavaScript library that runs silently on your pages. It watches what visitors do — which paragraphs are visible, how long they linger, how fast they scroll — and from that, it estimates how much they actually read versus how much they merely scrolled past. The results are sent to your analytics platform (Matomo, Google Analytics, or others) so you can see exactly which content truly engages your audience.

The library is open source, lightweight (< 4 KB), has zero dependencies, and is designed to impose near-zero performance overhead on your visitors.

## Live demo

**[Try the live demo](https://kntnt.github.io/kntnt-engagement-metrics/)** — a long-read article with the core library and overlay add-on running on it. Scroll and read the article. The overlay colour-codes each paragraph by reading state and shows live metrics in a panel at the bottom-right corner. Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd> to toggle the overlay on and off.

You can also run the demo locally by cloning the repository, building the project, and opening `demo.html` in your browser:

```bash
git clone https://github.com/Kntnt/kntnt-engagement-metrics.git
cd kntnt-engagement-metrics
bun install && bun run build
open demo.html  # or just double-click the file
```

## How it works

The library distinguishes between two behaviours: **reading** (the visitor pauses on content long enough to consume it) and **scanning** (the visitor scrolls content into view but moves on). Here is the process in brief:

1. The library finds all content elements matching a CSS selector (default: `<p>` tags).
2. An `IntersectionObserver` tracks which elements are visible in the viewport.
3. A lightweight tick loop advances reading for one element at a time — the topmost unfinished visible paragraph — modelling a human reader who reads top to bottom. Reading progress within each element is capped at its visible boundary.
4. Reading timers pause during active scrolling and when the browser tab is hidden.
5. Metrics are emitted on each tick to registered listeners (analytics add-ons).

The following sections explain each step in detail — enough to understand how the library works without reading the source code.

### Finding text to measure

When the library starts, it searches the page for all HTML elements that match a CSS selector — by default all `<p>` tags, but you can configure any selector (for instance `article :is(h1, h2, h3, p, ul, ol)` to include headings and lists). If you have set an `exclude` selector, any element inside an excluded area (a sidebar, a footer, a table of contents) is filtered out. Elements that are hidden or contain no text are also discarded.

The remaining elements form the content that will be measured, in the order they appear on the page.

### A countdown timer for each element

Each element gets its own countdown timer. The timer's duration is calculated from the element's character count and the configured reading speed (default: 882 characters per minute). A paragraph with 441 characters, for example, gets a 30-second timer. This represents the library's estimate of how long an average reader needs to read that particular element.

### Watching what is on screen

The library uses the browser's built-in `IntersectionObserver` API to monitor which elements are currently visible in the viewport and how much of each element is showing. This is efficient — the browser itself reports visibility changes rather than the library having to check repeatedly.

When an element appears in the viewport for the first time, the library also records how far down the page the visitor has scrolled. This is the scanning depth: the deepest point the visitor has reached.

### The reading model

Five times per second (every 200 ms), the library runs a measurement tick. Each tick looks for the topmost element that is visible and has not yet been fully read, and advances that element's countdown timer by 0.2 seconds. Only one element advances per tick — this models a human reader who finishes one paragraph before moving to the next.

There is one important constraint: reading progress cannot exceed the element's visible boundary. If only half of a paragraph is on screen, the timer advances until 50% of the estimated reading time has elapsed, then waits. Once the visitor scrolls to reveal more of the element, the timer continues. This prevents counting text as read when it is not yet visible.

If the visitor scrolls past a paragraph without pausing, the timer for that element never advances (or advances only partially). The library moves on to the next visible element. If the visitor later scrolls back up, reading resumes from where it left off — progress is never lost.

### Pausing during scrolling and tab switches

While the visitor is actively scrolling, reading timers do not advance. The library detects scrolling by measuring scroll speed; once the speed drops below a threshold and remains low for 500 ms, reading resumes. This distinguishes scanning (scrolling through content) from reading (pausing on content).

Timers also pause whenever the browser tab is hidden — if a visitor switches to another tab for five minutes, those five minutes are not counted as reading time.

### Computing the metrics

After each tick, the library computes a snapshot of aggregate metrics from all tracked elements:

- **Reading ratio** — the fraction of all content characters estimated to have been read. Each element contributes its character count multiplied by its timer's progress (0 to 1). Sum those up, divide by the total character count across all elements, and you get a number between 0 and 1. A reading ratio of 0.75 means roughly 75% of the text has been read.
- **Scanning ratio** — how far down the page the visitor has scrolled, relative to the total scrollable height. A visitor who scrolls to the very bottom reaches a scanning ratio of 1.
- **Reading time** — the total estimated seconds of actual reading so far (the sum of elapsed timer time across all elements).
- **Content time** — the total estimated time it would take to read everything.
- **Reading length** and **content length** — characters read and total characters.
- **Scanning depth** and **content depth** — pixels scrolled and total scrollable pixels.

### When events reach your analytics

The metrics snapshot is passed to all registered add-ons on every tick. The analytics add-ons (Matomo, Google Analytics) do not send an event on every tick — that would flood your analytics platform. Instead, they use configurable thresholds. Matomo fires reading events at 10%, 20%, 30%, … 100% by default; GA4 fires at 10%, 25%, 50%, 75%, 90%, and 100%.

When the reading ratio first crosses a threshold, the add-on fires a single event to your analytics platform — for example, "this visitor has read 25% of the content". Each threshold fires exactly once; subsequent ticks that remain above it do not trigger another event. A fully engaged reader generates a handful of reading events and a few scanning events for the entire page visit.

### Auto-stop

Once every element has been fully read and the visitor has scrolled to the bottom of the page, both the reading ratio and scanning ratio reach 1. The library then stops its measurement loop and releases its observers and event listeners, leaving zero overhead on the page.

For the full algorithm specification, see [`docs/algorithm.md`](docs/algorithm.md). For architecture and design principles, see [`docs/architecture.md`](docs/architecture.md).

## Packages

The library consists of four packages. You need the core package plus at least one add-on to do something useful with the measurements.

| Package | Description |
|---------|-------------|
| [`@kntnt/engagement-metrics`](packages/core) | Core measurement library (zero dependencies) |
| [`@kntnt/engagement-metrics-matomo`](packages/matomo) | Matomo Analytics add-on |
| [`@kntnt/engagement-metrics-gtag`](packages/gtag) | Google Analytics 4 (gtag.js) add-on |
| [`@kntnt/engagement-metrics-overlay`](packages/overlay) | Real-time visual overlay showing measurement in action |

### Core package

The core package is the measurement engine. It discovers content elements on the page, tracks their visibility, runs the reading model described above, and computes engagement metrics after each tick. It has zero runtime dependencies — no frameworks, no libraries, just browser APIs.

The core also provides the API that add-on packages build on. Add-ons implement a `MetricsListener` interface with a single `update(metrics)` method and register themselves with the measurer via `addListener()`. The measurer then calls every registered listener on each tick with a fresh metrics snapshot. Add-ons that need per-element data (like the overlay) can also call `getElements()` to access individual element states.

### Matomo package

The Matomo add-on translates engagement metrics into Matomo tracking events. It registers as a listener on the core measurer and, on each tick, checks whether any reporting threshold has been crossed. When a threshold is reached, it sends a single event via Matomo's standard `_paq.push()` API.

By default, reading events fire at 10%, 20%, 30%, 40%, 50%, 60%, 70%, 80%, 90%, and 100%. Scanning events fire at 25%, 50%, 75%, and 100%. Each threshold fires exactly once per page visit. The add-on also supports Matomo custom dimensions for reading ratio, scanning ratio, and reading time.

### Google Analytics 4 package

The GA4 add-on works the same way as the Matomo add-on, but sends events via the `gtag()` function that Google Analytics 4 uses. Reading events are sent as `engagement_reading` and scanning events as `engagement_scanning` (both names are configurable).

By default, reading events fire at 10%, 25%, 50%, 75%, 90%, and 100%. Scanning events fire at 25%, 50%, 75%, and 100%. Each event includes the threshold percentage, elapsed reading time, and current ratio as event parameters.

### Overlay package

The overlay add-on shows measurement happening in real time, directly on the page. It colour-codes each tracked element by reading state and displays a live metrics panel — useful for understanding what the library measures and for experimenting with different reading speed settings.

**What you see:**
- **Blue** outline — element not yet scrolled into view
- **Gold** outline with yellow gradient — element currently being read (gradient shows progress)
- **Green** outline and background — element fully read
- **Red** outline — element previously seen but no longer visible (paused)

The HUD panel includes a reading speed slider (100–3,000 characters per minute) that recalibrates all timers instantly, letting you find the right speed for your content. Toggle the overlay with <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd>.

## Configuration

All options are optional. The defaults work well for most sites.

| Option | Default | Description |
|--------|---------|-------------|
| `selector` | `'p'` | CSS selector for content elements |
| `exclude` | `''` | CSS selector for elements to exclude |
| `readingSpeed` | `882` | Average reading speed in characters per minute |
| `tickInterval` | `200` | Milliseconds between measurement ticks |
| `observerThresholds` | `[0, 0.25, 0.5, 0.75, 1.0]` | Visibility ratios that trigger observer callbacks |
| `scrollSpeedThreshold` | `50` | Minimum scroll speed (px/sec) to count as scrolling |
| `scrollCooldown` | `500` | Milliseconds after last scroll before reading resumes |

### Selector

Determines which elements the library measures. The default `'p'` targets all paragraph elements on the page. You can use any valid CSS selector — for instance, `'article :is(h1, h2, h3, p, ul, ol)'` measures headings, paragraphs, and lists inside an `<article>` element.

### Exclude

Filters out elements you do not want measured. An element is excluded if it matches this selector itself or has an ancestor that matches it. For example, `'.sidebar, .footer, .table-of-contents'` excludes any content inside those areas, even if it would otherwise match the `selector`.

When left empty (the default), no elements are excluded.

### Reading speed

The average reading speed in characters per minute. The library uses this to calculate how long a reader needs for each element: an element with 882 characters gets a 60-second timer at the default speed.

The default of 882 characters per minute comes from the International Reading Speed Texts (IReST) project, which measured reading speeds across 17 languages. The mean across 14 of those languages was 882 cpm, with speeds ranging from 65 to 71 milliseconds per character at a 95% confidence interval (Trauzettel-Klosinski S, Dietz K; IReST Study Group, "[Standardized Assessment of Reading Performance: The New International Reading Speed Texts IReST](https://doi.org/10.1167/iovs.11-8284)", *Invest Ophthalmol Vis Sci.* 2012;53(9):5452–5461).

You can change the reading speed at runtime via `measurer.setReadingSpeed()`, which recalibrates all timers while preserving current progress.

### Tick interval

How often (in milliseconds) the library runs its measurement loop. The default of 200 ms means five ticks per second. A lower value makes measurements more responsive but uses slightly more CPU. In practice, 200 ms is fine for virtually all use cases.

### Observer thresholds

The visibility ratios at which the browser's `IntersectionObserver` reports changes. The default `[0, 0.25, 0.5, 0.75, 1.0]` means the library is notified when an element crosses 0%, 25%, 50%, 75%, or 100% visibility. More thresholds give finer-grained tracking but generate slightly more callbacks. This setting rarely needs changing.

### Scroll speed threshold

The minimum scroll speed (in pixels per second) for the library to consider the visitor actively scrolling. While the scroll speed exceeds this threshold, reading timers are paused — the visitor is scanning, not reading. The default of 50 px/sec is a good balance for most content.

### Scroll cooldown

How long (in milliseconds) the library waits after the last scroll event before resuming reading timers. The default of 500 ms means the visitor must stop scrolling for half a second before reading is counted again. This prevents brief pauses during a fast scroll from being mistaken for reading.

## Metrics

The library computes these metrics after each measurement tick. They are passed to all registered add-ons and are also available on demand via `measurer.getMetrics()`.

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

### Reading time

The estimated number of seconds the visitor has spent actually reading. This is the sum of elapsed timer time across all tracked elements. A visitor who has read three paragraphs with timers of 20, 15, and 10 seconds has a reading time of 45 seconds.

Note that this is an *estimate* based on character count and configured reading speed — it reflects how long reading the consumed content *should* take, not a direct measurement of time spent on the page.

### Content time

The total estimated time (in seconds) it would take to read all measured content from start to finish. This is the sum of all element timer durations. It serves as the upper bound for reading time.

### Reading length

The estimated number of characters the visitor has read. Each element contributes its character count multiplied by its reading progress (0 to 1). An element with 500 characters at 60% progress contributes 300 characters.

### Content length

The total number of characters across all measured elements. This is a fixed value determined at initialisation. Together with reading length, it gives you the raw numbers behind the reading ratio.

### Scanning depth

The deepest scroll position (in pixels from the top of the page) the visitor has reached. This value only increases — scrolling back up does not reduce it. It represents how far the visitor has explored the page, regardless of whether they read the content.

### Content depth

The total scrollable height of the page in pixels (the document height minus the viewport height). Together with scanning depth, it gives you the raw numbers behind the scanning ratio.

### Reading ratio

The fraction of content estimated to have been read, expressed as a number between 0 and 1. It equals `readingLength / contentLength`. A reading ratio of 0.75 means roughly 75% of the text has been read.

This is typically the most useful metric for evaluating content engagement. A high reading ratio means the visitor consumed most of the content; a low ratio suggests they left early or skimmed.

### Scanning ratio

How far down the page the visitor has scrolled, expressed as a number between 0 and 1. It equals `scanningDepth / contentDepth`, capped at 1. A scanning ratio of 1 means the visitor reached the bottom of the page.

Comparing scanning ratio with reading ratio reveals visitor behaviour: a high scanning ratio with a low reading ratio indicates fast scrolling without reading; similar values for both suggest steady, engaged reading.

## Build and install

The packages are not yet published to npm or a CDN. To use them, you build the JavaScript files yourself using [Bun](https://bun.sh/) — a fast JavaScript toolkit similar to Node.js.

The library can be built in two formats:

- **ESM** (ECMAScript Modules) — for projects that use a bundler like Vite, webpack, or Parcel. You install the packages as dependencies and import them in your code.
- **IIFE** (Immediately Invoked Function Expression) — pre-built `.js` files that you load directly with `<script>` tags. No bundler needed.

Use ESM if your site already has a JavaScript build step. Use IIFE if you just want to drop a few script files into your HTML.

Both formats require [Bun](https://bun.sh/) to build. Bun is a fast, all-in-one JavaScript toolkit that handles package management, bundling, and running scripts. If you don't have it installed:

```bash
curl -fsSL https://bun.sh/install | bash
```

### Using a bundler (ESM)

If your project uses a bundler (Vite, webpack, Parcel, or similar), install the packages as dependencies and import them in your code:

```js
import { createMeasurer } from '@kntnt/engagement-metrics'
import { registerGtag } from '@kntnt/engagement-metrics-gtag'

const measurer = createMeasurer({
  selector: 'p',     // measure all <p> elements
  readingSpeed: 882, // characters per minute
})

registerGtag(measurer, {
  readingThresholds: [10, 25, 50, 75, 100],
})

measurer.start()
```

### Using script tags (IIFE)

The packages are not yet published to npm or a CDN. To use them, you build the files yourself:

1. Download and build the project:
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

## Development

The project uses [Bun](https://bun.sh/) for package management, building, testing, and script running.

### Prerequisites

You need Bun installed on your machine:

- [Bun](https://bun.sh/) (latest version)

### Setup

Clone the repository and install dependencies:

```bash
git clone https://github.com/Kntnt/kntnt-engagement-metrics.git
cd kntnt-engagement-metrics
bun install
```

### Commands

The most common commands during development:

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
