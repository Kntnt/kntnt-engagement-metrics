# Testing strategy

This document specifies how the project is tested. All tests are automated and run without human interaction.

## Three test levels

| Level | Scope | Tool | Location | Speed |
|-------|-------|------|----------|-------|
| Unit | Pure logic (Timer, TrackedElement, metrics math) | `bun test` | `packages/*/src/*.test.ts` | < 1 s |
| Component | Measurer + add-ons with simulated DOM | `bun test` + `happy-dom` | `packages/*/src/*.test.ts` | < 5 s |
| Integration | Full library in a real browser | Playwright | `tests/e2e/` | < 30 s |

### Running tests

```bash
bun test                    # Unit + component tests (fast, run often)
bun run test:e2e            # Integration tests (slower, run before commit)
```

## Level 1: Unit tests

Unit tests cover pure logic with no DOM dependency. They are the largest test suite.

### Timer

- Starts with correct `initialDuration` and `remaining`.
- `advance()` reduces `remaining` by the given seconds.
- `remaining` never goes below zero.
- `isComplete` returns true when remaining reaches zero.
- `progress` returns 0 at start, 1 at completion, proportional values in between.
- Zero-duration timer: `isComplete` is true immediately, `progress` is 1.
- Negative input to constructor is clamped to zero.

### TrackedElement

- `charCount` reflects the text content length of the DOM node.
- `visibilityRatio` starts at 0.
- `hasBeenSeen` starts as false, becomes true on first intersecting entry, never reverts to false.
- `isFullyRead` becomes true when the timer completes.
- `readingProgress` matches the timer's progress.
- Zero-length text content: timer duration is 0, element is immediately "fully read".

### Metrics computation

Test the metrics math in isolation by constructing elements with known values and verifying the computed `EngagementMetrics` snapshot:

- `readingTime` = sum of each element's `initialDuration * progress`.
- `contentTime` = sum of all `initialDuration` values.
- `readingLength` = sum of each element's `charCount * progress`.
- `contentLength` = sum of all `charCount` values.
- `readingRatio` = `readingLength / contentLength`, or 0 if `contentLength` is 0.
- `scanningRatio` = clamped to 0–1.
- Empty element list: all values are 0, `isActive` is false.

### Add-on listeners

- Matomo listener sends events at each configured threshold exactly once.
- Gtag listener sends events at each configured threshold exactly once.
- No events are sent for thresholds below the current metric value.
- Events are not duplicated on repeated `update()` calls with the same metrics.
- Missing tracker (`window._paq` / `window.gtag` undefined) logs a warning, does not throw.

## Level 2: Component tests (simulated DOM)

Component tests exercise the Measurer class with a DOM environment provided by `happy-dom`. They do NOT run a real browser — `happy-dom` is loaded as a Bun test preset.

### Setup

```typescript
// bunfig.toml (or per-test config)
[test]
preload = ["happy-dom"]
```

Each test creates an HTML document with `<p>` elements, instantiates a Measurer, and controls the IntersectionObserver and time progression manually.

### Mocking IntersectionObserver

`happy-dom` does not implement IntersectionObserver. The tests must provide a mock:

```typescript
class MockIntersectionObserver implements IntersectionObserver {
  readonly entries: Map<Element, IntersectionObserverEntry> = new Map()
  readonly callback: IntersectionObserverCallback

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback
  }

  observe(target: Element): void { /* track target */ }
  unobserve(target: Element): void { /* remove target */ }
  disconnect(): void { /* clear all */ }
  takeRecords(): IntersectionObserverEntry[] { return [] }

  /** Test helper: simulate an intersection change. */
  trigger(target: Element, intersectionRatio: number, isIntersecting: boolean): void {
    const entry = { target, intersectionRatio, isIntersecting } as IntersectionObserverEntry
    this.callback([entry], this)
  }
}
```

Assign this to `globalThis.IntersectionObserver` before each test.

### Mocking time

Use `bun:test`'s fake timer support (`jest.useFakeTimers()`) to control `requestAnimationFrame`, `setTimeout`, and `performance.now()`. Advance time in controlled steps to simulate tick intervals.

### Test scenarios

- **Initialization:** Measurer finds the correct elements, creates correct number of TrackedElements, sets up observer.
- **Visibility change:** triggering the mock observer updates the element's `visibilityRatio` and `hasBeenSeen`.
- **Tick advances timers:** advancing fake time by one tick interval with an element 100% visible advances that element's timer by `tickInterval / 1000` seconds.
- **Partial visibility:** an element at 50% visibility advances at half speed.
- **Scroll pauses reading:** setting `isScrolling` state (by dispatching scroll events) pauses timer advancement.
- **Page hidden pauses reading:** setting `document.visibilityState` to `'hidden'` pauses all timers.
- **Auto-stop:** when all elements are fully read and scanned, the measurer stops itself.
- **Listener notification:** registered listeners receive a metrics snapshot on each tick.
- **Multiple listeners:** all listeners are called. Removing a listener stops its notifications.

## Level 3: Integration tests (Playwright)

Integration tests verify the full library in a real headless browser. They test the actual IIFE build, real IntersectionObserver, real scroll events, and real timing.

### Setup

Playwright is installed as a dev dependency at the workspace root. Tests live in `tests/e2e/` with a shared fixture page.

```
tests/
├── e2e/
│   ├── playwright.config.ts
│   ├── scenarios.spec.ts
│   └── fixtures/
│       └── test-page.html     → Static page with the IIFE build loaded
```

The test page (`test-page.html`) contains 15–20 paragraphs of realistic text (varying lengths, 500–2000 characters each), totaling enough content to require scrolling. The IIFE build is loaded via a `<script>` tag. The measurer is started automatically on DOMContentLoaded, and the measurer instance is exposed on `window.KntntEngagementMetrics.measurer`.

### Build before test

The e2e test script must build the IIFE first:

```json
{
  "scripts": {
    "test:e2e": "bun run build:core && playwright test --config tests/e2e/playwright.config.ts"
  }
}
```

### Behaviour scenarios

Each scenario is a test case that loads the test page, performs a sequence of actions, and asserts metrics within expected ranges. Values are approximate (±10%) because real browser timing is non-deterministic.

#### Scenario 1: "Bouncer"

Simulates a visitor who leaves almost immediately.

```
1. Load page.
2. Wait 1 second.
3. Read metrics.
4. Assert:
   - readingRatio < 0.05
   - scanningRatio < 0.15
```

#### Scenario 2: "Fast scroller"

Simulates a visitor who scrolls to the bottom in a few seconds without pausing.

```
1. Load page.
2. Scroll to bottom over 2 seconds (smooth, continuous scroll).
3. Wait 500 ms for cooldown.
4. Read metrics.
5. Assert:
   - scanningRatio > 0.9
   - readingRatio < 0.1
```

#### Scenario 3: "Skimmer"

Simulates a visitor who scrolls at moderate speed with brief pauses.

```
1. Load page.
2. For each 25% of the page:
   a. Scroll to that position over 1 second.
   b. Pause for 2 seconds.
3. Read metrics.
4. Assert:
   - scanningRatio > 0.9
   - readingRatio between 0.05 and 0.3
```

#### Scenario 4: "Engaged reader"

Simulates a visitor who reads most of the content.

```
1. Load page.
2. For each <p> element (or groups of 2–3):
   a. Scroll the element into full view.
   b. Wait long enough for the timer to complete
      (charCount / readingSpeed * 60 seconds, plus a small margin).
3. Read metrics.
4. Assert:
   - readingRatio > 0.85
   - scanningRatio > 0.9
```

#### Scenario 5: "Partial reader"

Simulates a visitor who reads the first half thoroughly, then leaves.

```
1. Load page.
2. Scroll through and pause at each element in the first 50% of the page
   (same timing as "Engaged reader").
3. Read metrics.
4. Assert:
   - readingRatio between 0.35 and 0.65
   - scanningRatio between 0.4 and 0.6
```

#### Scenario 6: "Tab switcher"

Verifies that timers pause when the page is hidden.

```
1. Load page.
2. Scroll first element into view. Wait 2 seconds (some reading occurs).
3. Record readingTime as t1.
4. Hide the page (page.evaluate(() => { ... }) or navigate away and back).
5. Wait 5 seconds.
6. Show the page again. Wait 1 second.
7. Record readingTime as t2.
8. Assert:
   - t2 - t1 is approximately 1 second (not 6 seconds).
   - The 5-second hidden period did NOT advance timers.
```

### Scroll helper

All scenarios use a shared helper function for realistic scrolling:

```typescript
async function smoothScrollTo(page: Page, targetY: number, durationMs: number): Promise<void> {
  const steps = Math.ceil(durationMs / 50)  // ~20 fps
  const startY = await page.evaluate(() => window.scrollY)
  for (let i = 1; i <= steps; i++) {
    const y = startY + (targetY - startY) * (i / steps)
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y)
    await page.waitForTimeout(50)
  }
}
```

### Assertions

Use range-based assertions rather than exact values:

```typescript
expect(metrics.readingRatio).toBeGreaterThan(0.85)
expect(metrics.readingRatio).toBeLessThan(1.05)  // allow slight overshoot from timing
```

## CI integration

Both test levels should run in CI (e.g., GitHub Actions):

1. `bun test` — runs unit + component tests.
2. `bun run test:e2e` — builds the IIFE, then runs Playwright with `chromium` only (fastest).

The e2e tests require `npx playwright install chromium` in the CI setup step.
