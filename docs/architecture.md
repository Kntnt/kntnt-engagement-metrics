# Architecture

## Overview

Kntnt Engagement Metrics is a monorepo containing a core library and analytics add-ons. The core library runs in the browser and measures how deeply a user engages with text content on a web page. Add-ons consume the metrics and send them to analytics platforms.

## Design principles

1. **Minimal footprint** — the core library must be as small as possible (target: < 4 KB gzipped) and impose near-zero CPU overhead on the client.
2. **Zero dependencies** — the core has no runtime dependencies. No jQuery, no framework.
3. **Modern browser APIs only** — targets browsers supporting ES2022, `IntersectionObserver`, `requestAnimationFrame`, and `Page Visibility API`. No polyfills.
4. **Plugin architecture** — analytics integrations are separate packages that depend on the core via `peerDependencies`.
5. **Tree-shakeable** — ESM exports allow bundlers to eliminate unused code.
6. **IIFE distribution** — each package also ships a pre-built minified IIFE file for direct `<script>` tag inclusion.

## Monorepo structure

```
kntnt-engagement-metrics/
├── packages/
│   ├── core/           → @kntnt/engagement-metrics
│   ├── matomo/         → @kntnt/engagement-metrics-matomo
│   ├── gtag/           → @kntnt/engagement-metrics-gtag
│   └── overlay/        → @kntnt/engagement-metrics-overlay
├── docs/               → Detailed technical documentation
├── CLAUDE.md           → Claude Code agent instructions
├── AGENTS.md           → Universal AI agent instructions
└── README.md           → Human-facing documentation
```

## Package dependency graph

```
@kntnt/engagement-metrics           (zero dependencies)
    ↑ peerDependency
@kntnt/engagement-metrics-matomo    (peer: core)
@kntnt/engagement-metrics-gtag      (peer: core)
@kntnt/engagement-metrics-overlay   (peer: core)
```

## Tooling

| Tool | Purpose |
|------|---------|
| Bun | Package manager, bundler, test runner, script runner |
| TypeScript | Type safety, declaration generation |
| Biome | Linting and formatting (replaces ESLint + Prettier) |

### Why Bun (not npm/pnpm + esbuild/rollup)

Bun is a single binary that replaces Node.js + npm/pnpm + a separate bundler. This dramatically reduces tooling complexity — one of the project's explicit goals. `bun build` handles TypeScript transpilation and bundling natively. `bun test` provides a built-in test runner compatible with Jest's `expect` API.

### Why Biome (not ESLint + Prettier)

Biome is a single tool that replaces both ESLint and Prettier with near-instant performance. It reduces configuration surface and dependency count.

## Core module architecture

```
packages/core/src/
├── index.ts             → Public API (re-exports)
├── iife.ts              → IIFE entry point (auto-starts measurement)
├── measurer.ts          → Orchestrator: observes elements, manages timers, emits metrics
├── measurer.test.ts     → Component tests (jsdom + mock IntersectionObserver)
├── element.ts           → Tracks a single content element's visibility and reading state
├── element.test.ts      → Unit tests
├── timer.ts             → Countdown timer that advances proportionally to visibility
├── timer.test.ts        → Unit tests
└── types.ts             → Shared TypeScript interfaces and types
```

### Key classes

- **`Measurer`** — the central orchestrator. Created with a configuration object. Discovers content elements in the DOM, creates `Element` instances, runs measurement ticks, and notifies listeners.
- **`Element`** — represents a single tracked DOM element (typically a `<p>` tag). Holds a `Timer` and tracks the element's visibility ratio within the viewport.
- **`Timer`** — a countdown that represents estimated reading time for one element. Advances proportionally to the element's visibility ratio (100% visible = full speed, 50% visible = half speed, 0% = paused).

### Listener interface

```typescript
interface MetricsListener {
  update(metrics: EngagementMetrics): void
}
```

Add-ons implement `MetricsListener` and register via `measurer.addListener(listener)`. The measurer calls `update()` on every measurement tick with a fresh snapshot.

## Add-on architecture

Each add-on package follows the same pattern:

1. Import `MetricsListener` type from core.
2. Implement a listener class that translates metrics into analytics events.
3. Export a `register(measurer, config)` function for easy setup.
4. Provide an IIFE entry point that auto-registers with the global measurer.

The **overlay** add-on is a special case: it uses `measurer.getElements()` to access per-element reading state, enabling real-time visualization of individual elements rather than only consuming aggregate metrics.

## Distribution models

### ESM (for bundler users)

```js
import { createMeasurer } from '@kntnt/engagement-metrics'
import { registerMatomo } from '@kntnt/engagement-metrics-matomo'

const measurer = createMeasurer({ /* config */ })
registerMatomo(measurer, { /* matomo config */ })
measurer.start()
```

### IIFE (for script-tag users)

```html
<script src="kntnt-engagement-metrics.min.js"></script>
<script src="kntnt-engagement-metrics-matomo.min.js"></script>
<script>
  KntntEngagementMetrics.start({ /* config */ })
</script>
```

The IIFE builds expose a `window.KntntEngagementMetrics` global namespace.
