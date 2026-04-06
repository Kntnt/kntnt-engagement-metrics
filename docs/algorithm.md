# Algorithm specification

This document specifies the engagement measurement algorithm in full detail. An AI agent should be able to implement the entire core library from this specification alone.

## Goal

Estimate how much of a page's text content a visitor actually **reads** (as opposed to merely scrolls past), and how far they **scan** (scroll through). Produce a continuous stream of metrics that external systems can consume.

## Definitions

| Term | Definition |
|------|-----------|
| **Content element** | A DOM element containing text to be measured (default: all `<p>` elements) |
| **Reading** | The visitor is assumed to be reading an element when it is visible in the viewport and the page is not being scrolled |
| **Scanning** | The visitor has scrolled an element into view at least once, regardless of whether they paused to read |
| **Visibility ratio** | The fraction (0–1) of a content element's bounding box that overlaps with the viewport |
| **Reading speed** | Configurable parameter: characters per minute the average reader consumes (default: 882) |
| **Estimated reading time** | `element.textContent.length / readingSpeed * 60` (in seconds) |

## Configuration

```typescript
interface MeasurerConfig {
  /** CSS selector for content elements. Default: 'p' */
  selector: string

  /** CSS selector for elements to exclude. Default: '' (no exclusions) */
  exclude: string

  /** Average reading speed in characters per minute. Default: 882 */
  readingSpeed: number

  /** Milliseconds between measurement ticks. Default: 200 */
  tickInterval: number

  /** IntersectionObserver threshold steps (array of ratios 0–1). Default: [0, 0.25, 0.5, 0.75, 1.0] */
  observerThresholds: number[]

  /** Minimum scroll speed (px/sec) to count as active scrolling. Default: 200 */
  scrollSpeedThreshold: number

  /** Milliseconds after last scroll event before reading resumes. Default: 50 */
  scrollCooldown: number
}
```

All fields are optional. Defaults are applied for missing values.

## Lifecycle

### 1. Initialization

1. Query the DOM using `document.querySelectorAll(config.selector)`. Both `querySelectorAll()` and the `closest()` call in step 2 are wrapped in try-catch to handle invalid CSS selectors gracefully — an invalid selector logs a warning and results in an empty element list rather than throwing.
2. If `config.exclude` is non-empty, filter out any element that matches `config.exclude` itself or has an ancestor matching `config.exclude` (i.e., `element.closest(config.exclude)` returns non-null).
3. Filter out non-HTML elements and zero-height elements: any node where `'offsetHeight' in node` is false (i.e., not an `HTMLElement`) or where `(node as HTMLElement).offsetHeight === 0` is excluded. Also filter out elements with zero `textContent.length`.
4. For each element, create an `Element` instance with:
   - A reference to the DOM node.
   - A `Timer` initialized with `estimatedReadingTime` = `textContent.length / readingSpeed * 60` seconds.
   - `visibilityRatio` = 0.
   - `hasBeenSeen` = false.
   - `isFullyRead` = false.
5. Set up an `IntersectionObserver` with the configured thresholds, observing all content elements.
6. Register a scroll listener (passive) on the window.
7. Register a `visibilitychange` listener on the document.

### 2. IntersectionObserver callback

When an element's intersection changes:

1. Look up the corresponding `Element` instance via a `Map<Element, TrackedElement>` for O(1) access (no linear search).
2. Update `element.visibilityRatio` to `entry.intersectionRatio`.
3. If `entry.isIntersecting` and `element.hasBeenSeen` is false:
   - Set `element.hasBeenSeen = true`.
   - Update the cached `scanningDepth` incrementally: compute the element's absolute bottom position (`el.getBoundingClientRect().bottom + window.scrollY`) and keep the maximum across all seen elements. This avoids recalculating scanning depth on every tick.

This callback fires asynchronously and efficiently — no polling needed for visibility changes.

### 3. Scroll detection

**Purpose:** Pause reading timers while the user is actively scrolling, because a scrolling user is scanning, not reading.

1. On each `scroll` event, record `Date.now()` as `lastScrollTime`.
2. Compute instantaneous scroll speed: `(|currentScrollY - previousScrollY| / timeDelta) * 1000` where `timeDelta` is in milliseconds, so the multiplication converts the result to pixels per second.
3. If scroll speed exceeds `scrollSpeedThreshold`, set `isScrolling = true`.
4. After `scrollCooldown` milliseconds with no scroll event, set `isScrolling = false`.

Implementation note: use a single `setTimeout` that is reset on each scroll event, rather than a moving-average approach.

### 4. Page visibility

1. Listen for the `visibilitychange` event on `document`.
2. When `document.visibilityState !== 'visible'`, set `isPageVisible = false`.
3. When visible again, set `isPageVisible = true`.
4. While `isPageVisible` is false, no timers advance.

### 5. Measurement tick

A `requestAnimationFrame`-based loop runs every `tickInterval` milliseconds (throttled by checking elapsed time against `tickInterval`). The loop is **sequential**: only one element — the topmost unfinished visible element — advances per tick. This models a human reader who finishes one paragraph before moving to the next.

```
function tick(timestamp):
    if timestamp - lastTickTime < tickInterval: return
    lastTickTime = timestamp

    if NOT isPageVisible: return
    if isScrolling: return

    elapsed = tickInterval / 1000  // seconds

    // Find the topmost unfinished element that is visible
    for each element in trackedElements (in DOM order):
        if element.isFullyRead: continue
        if element.visibilityRatio == 0: continue

        // Cap reading at the visible boundary and advance at full speed
        element.timer.targetRatio = element.visibilityRatio
        element.timer.advance(elapsed)
        break  // only one element per tick

    metrics = computeMetrics()
    for each listener in listeners:
        try: listener.update(metrics)
        catch: continue

    if metrics.readingRatio == 1.0 AND metrics.scanningRatio == 1.0:
        stop()
    else:
        requestAnimationFrame(tick)
```

### 6. Metrics computation

After each tick, compute and emit:

```typescript
interface EngagementMetrics {
  /** Estimated seconds of actual reading so far */
  readingTime: number

  /** Total estimated reading time for all content */
  contentTime: number

  /** Estimated characters read so far */
  readingLength: number

  /** Total characters across all content elements */
  contentLength: number

  /** Maximum vertical scroll position reached (pixels) */
  scanningDepth: number

  /** Total scrollable content height (pixels) */
  contentDepth: number

  /** readingLength / contentLength (0–1) */
  readingRatio: number

  /** scanningDepth / contentDepth (0–1, capped at 1) */
  scanningRatio: number

  /** True if measurement is still running */
  isActive: boolean
}
```

**Calculation details:**

- `readingTime` = sum of `(element.timer.initialDuration - element.timer.remaining)` for all elements, floored at 0.
- `contentTime` = sum of `element.timer.initialDuration` for all elements.
- `readingLength` = sum of `element.textContent.length * element.readingProgress` where `readingProgress = 1 - (remaining / initialDuration)`, capped at 1.
- `contentLength` = sum of `element.textContent.length` for all elements.
- `scanningDepth` = the cached maximum absolute bottom position across all seen elements, updated incrementally in the IntersectionObserver callback when an element is first seen (see section 2 above). No DOM reads occur during metrics computation.
- `contentDepth` = `document.documentElement.scrollHeight - window.innerHeight`.
- `readingRatio` = `readingLength / contentLength` (0 if contentLength is 0).
- `scanningRatio` = `Math.min(1, scanningDepth / contentDepth)` (0 if contentDepth is 0).

## Timer class

```typescript
class Timer {
    initialDuration: number  // seconds (mutable via recalibrate)
    remaining: number        // seconds
    targetRatio: number      // 0–1, default 1.0 — the progress cap for advance()

    constructor(durationSeconds: number)

    /**
     * Advance the timer by the given number of seconds.
     * Remaining will not drop below `initialDuration * (1 - targetRatio)`,
     * so reading cannot progress beyond the visible boundary.
     */
    advance(seconds: number): void {
        const floor = this.initialDuration * (1 - this.targetRatio)
        this.remaining = Math.max(floor, this.remaining - seconds)
    }

    /**
     * Recalibrate the timer with a new duration, preserving current progress.
     * If progress is 60% and new duration is 10s, remaining becomes 4s.
     */
    recalibrate(newDurationSeconds: number): void {
        const currentProgress = this.progress
        this.initialDuration = Math.max(0, newDurationSeconds)
        this.remaining = this.initialDuration * (1 - currentProgress)
    }

    get isComplete(): boolean {
        return this.remaining <= 0
    }

    get progress(): number {
        if (this.initialDuration === 0) return 1
        return 1 - this.remaining / this.initialDuration
    }

    /** True when progress has reached or exceeded the current targetRatio. */
    get isAtTarget(): boolean {
        if (this.initialDuration === 0) return true
        return this.progress >= this.targetRatio
    }
}
```

## Sequential reading model

The algorithm models a human reader who reads one paragraph at a time, top to bottom:

1. **One element at a time**: on each tick, only the topmost unfinished element that is currently visible in the viewport advances its timer.
2. **Target-ratio cap**: the timer's `targetRatio` is set to the element's `visibilityRatio`. This means reading progresses up to the visible boundary of the element, then stops — the reader cannot read what is not visible.
3. **Skip ahead**: if the topmost unfinished element has `visibilityRatio === 0` (scrolled out of view), the algorithm skips to the next visible unfinished element. This models a reader who scrolls past content.
4. **Scroll-back resumes**: if the user scrolls back up to a partially-read element, reading resumes from where it left off. Progress is never lost.
5. **Full-speed advancement**: within the target cap, the timer advances at 1:1 real time (not scaled by visibility). The cap — not the speed — controls how far reading can progress.

## Runtime recalibration

Three measurement parameters can be changed at runtime via setter methods on the measurer. All three validate their input and silently reject invalid values (with a `console.warn()`).

### Reading speed

`measurer.setReadingSpeed(charsPerMinute)` accepts any positive finite number. It recalibrates all element timers by computing a new `initialDuration` for each element (`charCount / newSpeed * 60`) and calling `timer.recalibrate()`, which preserves the current reading progress. Elements that have already been fully read remain complete. This enables real-time experimentation with different reading speeds using the overlay add-on.

### Scroll cooldown

`measurer.setScrollCooldown(ms)` accepts any non-negative finite number (including zero). The value is written to the internal config and takes effect on the next scroll event. Setting the cooldown to zero disables the cooldown — reading resumes immediately after scrolling stops.

### Scroll speed threshold

`measurer.setScrollSpeedThreshold(pxPerSec)` accepts any positive finite number. The value is written to the internal config and takes effect on the next scroll event.

## Edge cases

1. **Empty page** — if no content elements are found, emit metrics with all values at 0 and `isActive = false`. Do not start the measurement loop.
2. **Single element** — works normally; the algorithm has no special-casing for element count.
3. **Dynamically added content** — NOT supported in v0.1. A future version may add a `MutationObserver` to detect new elements.
4. **Iframes** — the library measures only the document it is loaded in. Cross-frame measurement is out of scope.
5. **Zero-height elements** — filtered out during initialization (elements with `offsetHeight === 0` are skipped).
6. **Very long elements** — the IntersectionObserver thresholds handle partial visibility. A 2000px-tall paragraph at 25% visibility will have its timer capped at 25% progress until more of the element scrolls into view.
7. **Rapid tab switching** — the page visibility handler pauses and resumes cleanly. No time "leaks" during hidden periods.

## Performance considerations

- The `IntersectionObserver` callback is handled by the browser's compositor thread — it is much cheaper than polling `getBoundingClientRect()` on every tick.
- The `requestAnimationFrame` loop is automatically paused by the browser when the tab is hidden.
- The scroll listener is registered as `passive: true` to avoid blocking scroll performance.
- The tick function does minimal work: a single loop over tracked elements with simple arithmetic. No DOM reads during the tick.
- Scanning depth is cached incrementally in the `IntersectionObserver` callback when elements are first seen, so metrics computation requires no DOM reads at all.
- Element lookup in the `IntersectionObserver` callback uses a `Map<Element, TrackedElement>` for O(1) access, avoiding linear search over the tracked element list.
