# Interval-based reading progress tracking

## Problem

The current implementation sets each element's `targetRatio` to the instantaneous `visibilityRatio` from the IntersectionObserver. This works when the element is always exposed from the same direction, but fails when different parts of the element have been visible at different times.

Example: a ten-line paragraph. The top 30% is visible in the viewport on page load. The reader pauses long enough for the timer to reach 20%. Then the page scrolls up so only the bottom 40% (lines 7-10) is visible. The code sets `targetRatio = 0.4`, but the reader has cumulatively seen 70% of the element (top 30% + bottom 40%). The timer should be allowed to reach 60% (20% already read + 40% new visible content), not be capped at 40%.

Root cause: the code tracks *how much* of the element is currently visible, not *which part* has ever been visible.

## Solution

Replace instantaneous `visibilityRatio` with a cumulative "seen ratio" as the basis for `targetRatio`. Each IntersectionObserver callback computes the currently visible interval (a `[start, end]` pair in the range 0-1) from the entry's `boundingClientRect` and `rootBounds`. These intervals are accumulated over time, with overlapping and adjacent intervals merged. The total coverage of the merged intervals becomes the new `targetRatio`.

The Timer class and its `advance()` method are unchanged. Only the input to `targetRatio` changes.

## Design

### 1. IntervalSet class (`packages/core/src/interval-set.ts`)

A pure-math utility that accumulates `[start, end]` intervals in the range 0-1 and merges overlapping/adjacent ones.

```typescript
class IntervalSet {
  #intervals: [number, number][] = []

  /** Add an interval [start, end]. Clamps to [0, 1]. Merges with existing overlaps. */
  add(start: number, end: number): void

  /** Total covered fraction (0-1). Sum of all merged interval widths. */
  get coverage(): number

  /** Number of disjoint intervals currently stored. */
  get size(): number

  /** The merged intervals, for diagnostic/overlay use. */
  get intervals(): ReadonlyArray<readonly [number, number]>

  /** Reset to empty. */
  clear(): void
}
```

**Merge algorithm:** After clamping and validating (`start < end`), insert the new interval, sort by start, then do a single linear sweep to merge overlapping/touching intervals. The array will almost always contain 1-3 intervals (a paragraph can only be exposed from top, bottom, or both ends), so the sort is effectively O(1).

**Edge cases:**
- `start >= end` after clamping: no-op (degenerate interval).
- `start` or `end` is NaN/Infinity: no-op (guard clause).
- Already at 100% coverage: `add()` is a no-op short-circuit.

### 2. TrackedElement changes (`packages/core/src/element.ts`)

TrackedElement gets an `IntervalSet` instance:

- **New private field:** `#seenIntervals = new IntervalSet()`
- **New method:** `addSeenInterval(start: number, end: number): void` -- delegates to `#seenIntervals.add()`. Marked `@internal` in JSDoc (same pattern as Timer's `targetRatio` setter). Not part of the public API.
- **New getter:** `seenRatio: number` -- returns `#seenIntervals.coverage`. This is what the measurer uses as `targetRatio`.
- **New getter:** `seenIntervals: ReadonlyArray<readonly [number, number]>` -- exposes the interval data for diagnostic/overlay use.

Existing members are unchanged:
- `visibilityRatio` -- still updated by `updateVisibility()`, still used by the tick loop to skip non-visible elements.
- `hasBeenSeen` -- still set to true on first intersection, still used by the measurer for scanning depth tracking.
- `updateVisibility()` -- continues to update `visibilityRatio` and `hasBeenSeen`. Does not compute intervals (that responsibility stays in the measurer, which has access to viewport geometry).

### 3. Measurer changes (`packages/core/src/measurer.ts`)

**`#handleIntersection()`** -- after the existing `updateVisibility(entry)` call, compute the visible interval and report it:

```
rect = entry.boundingClientRect
rootBounds = entry.rootBounds

if rootBounds is null: skip
if rect.height === 0: skip

start = clamp(0, -rect.top / rect.height, 1)
end   = clamp(0, (rootBounds.height - rect.top) / rect.height, 1)

if start < end:
    element.addSeenInterval(start, end)
```

The formula computes which fraction of the element is above the viewport top (`-rect.top / rect.height`) and which fraction is within the viewport, handling all cases uniformly: element protruding below (top visible), above (bottom visible), both sides (middle visible), or fully visible.

Guard against `rootBounds === null` (can occur when the observer is disconnected or in certain iframe scenarios).

**`#advanceTimers()`** -- one line changes:

```typescript
// Before:
element.timer.targetRatio = element.visibilityRatio

// After:
element.timer.targetRatio = element.seenRatio
```

Everything else is unchanged: sequential reading model, scroll pausing, page visibility handling.

### 4. Default threshold change

`DEFAULTS.observerThresholds` changes from `[0, 0.25, 0.5, 0.75, 1.0]` to `[0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]`.

This reduces worst-case interval lag during slow scrolling from 25 to 10 percentage points. The cost is roughly double the IO callbacks, but each callback does only simple arithmetic plus an interval merge on a tiny array -- negligible.

The `MeasurerConfig` type is unchanged -- `observerThresholds` remains user-configurable; only the default changes.

## Performance

Reading `boundingClientRect` and `rootBounds` from the IO entry costs nothing extra -- the browser has already computed these values and exposes them as properties on the entry. No additional DOM reads are needed, either in the callback or in the tick loop.

The interval array stays tiny (1-3 entries for a typical paragraph). Sort and merge are effectively constant-time.

## Test strategy

### `interval-set.test.ts` (unit tests, new file)

Pure math tests:
- Single interval: coverage equals interval width.
- Overlapping intervals: merged correctly, coverage reflects union.
- Disjoint intervals: stored separately, coverage is sum of widths.
- Adjacent intervals: merged into one.
- Full coverage short-circuit: `add()` is a no-op after coverage reaches 1.0.
- Degenerate inputs: NaN, Infinity, start >= end, zero-width -- all no-ops.
- `intervals` getter: returns correct merged intervals in order.
- `clear()`: resets to empty, coverage returns to 0.

### `element.test.ts` (additions to existing tests)

- `seenRatio` starts at 0.
- `addSeenInterval` accumulates intervals; `seenRatio` reflects merged coverage.
- `seenIntervals` exposes the interval data.
- Existing tests pass unchanged.

### `measurer.test.ts` (additions to existing component tests)

- Scroll-back scenario: element partially visible from top, scroll past, element partially visible from bottom. Verify `targetRatio` reflects the union of both intervals.
- Zero-height rect: IO callback with `rect.height === 0` is a no-op (no interval added).
- Null rootBounds: IO callback with `rootBounds === null` is a no-op.

### Existing tests

All existing tests should pass unchanged since `visibilityRatio`, `hasBeenSeen`, and Timer behavior are untouched.

## Documentation updates

- `docs/algorithm.md` -- update the sequential reading model to describe interval-based `targetRatio`. Update default thresholds.
- `docs/api-contracts.md` -- add `seenRatio` and `seenIntervals` to the `TrackedElement` interface. Document `addSeenInterval` as `@internal`.

## Files changed

| File | Change |
|------|--------|
| `packages/core/src/interval-set.ts` | New file: IntervalSet class |
| `packages/core/src/interval-set.test.ts` | New file: unit tests |
| `packages/core/src/element.ts` | Add `#seenIntervals`, `seenRatio`, `seenIntervals`, `addSeenInterval()` |
| `packages/core/src/element.test.ts` | Add tests for new members |
| `packages/core/src/measurer.ts` | Compute visible interval in IO callback; use `seenRatio` in `#advanceTimers()` |
| `packages/core/src/measurer.test.ts` | Add scroll-back scenario test |
| `packages/core/src/index.ts` | Re-export `IntervalSet` |
| `docs/algorithm.md` | Update sequential reading model and default thresholds |
| `docs/api-contracts.md` | Add `seenRatio`, `seenIntervals` to TrackedElement interface |
