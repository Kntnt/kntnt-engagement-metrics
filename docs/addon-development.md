# Add-on development guide

## What is an add-on?

An add-on is a separate npm package that consumes engagement metrics from the core library and sends them to an external analytics platform. Each add-on is a package within this monorepo under `packages/`.

## Creating a new add-on

### 1. Create the package directory

```
packages/<name>/
├── src/
│   ├── index.ts       → Public API exports
│   ├── iife.ts        → IIFE entry point
│   ├── listener.ts    → MetricsListener implementation
│   └── types.ts       → Configuration types
├── package.json
└── tsconfig.json
```

### 2. Package naming

- npm package: `@kntnt/engagement-metrics-<name>`
- IIFE file: `kntnt-engagement-metrics-<name>.min.js`
- IIFE namespace: `window.KntntEngagementMetrics.<name>`

### 3. Implement the listener

```typescript
import type { MetricsListener, EngagementMetrics } from '@kntnt/engagement-metrics'

export class MyAnalyticsListener implements MetricsListener {
  #config: MyConfig
  #reportedThresholds: Set<number> = new Set()

  constructor(config: MyConfig) {
    this.#config = config
  }

  update(metrics: EngagementMetrics): void {
    // Check which thresholds have been crossed
    for (const threshold of this.#config.readingThresholds) {
      if (metrics.readingRatio * 100 >= threshold && !this.#reportedThresholds.has(threshold)) {
        this.#reportedThresholds.add(threshold)
        this.#sendEvent('reading_progress', { percentage: threshold })
      }
    }
  }

  #sendEvent(name: string, params: Record<string, unknown>): void {
    // Send to your analytics platform
  }
}
```

### 4. Export a registration function

```typescript
import type { Measurer } from '@kntnt/engagement-metrics'
import { MyAnalyticsListener } from './listener.js'
import type { MyConfig } from './types.js'

const DEFAULTS: MyConfig = {
  readingThresholds: [10, 25, 50, 75, 100],
  scanningThresholds: [25, 50, 75, 100],
}

export function registerMyAnalytics(measurer: Measurer, config?: Partial<MyConfig>): void {
  const mergedConfig = { ...DEFAULTS, ...config }
  const listener = new MyAnalyticsListener(mergedConfig)
  measurer.addListener(listener)
}
```

### 5. Create the IIFE entry point

The IIFE entry point auto-registers with the global measurer:

```typescript
import { registerMyAnalytics } from './index.js'

// Access the global measurer created by the core IIFE
const ns = (window as any).KntntEngagementMetrics
if (ns?.measurer) {
  const config = (window as any).kntntEngagementMetricsMyConfig ?? {}
  registerMyAnalytics(ns.measurer, config)
  ns.myAnalytics = { register: registerMyAnalytics }
}
```

### 6. Set up package.json

Copy from an existing add-on (e.g., `packages/matomo/package.json`) and update:

- `name` → `@kntnt/engagement-metrics-<name>`
- `description`
- Build script naming

### 7. Threshold-based reporting pattern

All analytics add-ons should follow the same pattern for reporting:

1. Define configurable threshold arrays (e.g., `[10, 25, 50, 75, 100]`).
2. Track which thresholds have been reported (using a `Set<number>`).
3. On each `update()` call, check if any new thresholds have been crossed.
4. Send an event only once per threshold.

This prevents flooding the analytics platform with events on every tick.

### 8. Tracker auto-detection

If the analytics platform offers multiple integration methods (e.g., direct API, Tag Manager dataLayer, etc.), implement auto-detection:

1. Check for the most specific API first (e.g., `window._paq` for Matomo).
2. Fall back to generic APIs (e.g., `window.dataLayer`).
3. Fall back to `console.warn()` if no tracker is found.

### 9. Testing add-ons

- Mock the `Measurer` by passing fake metrics to the listener's `update()` method.
- Verify that events are sent at the correct thresholds.
- Verify that events are not duplicated.
- Verify auto-detection logic for different tracker configurations.
