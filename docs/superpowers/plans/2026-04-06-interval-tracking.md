# Interval-Based Reading Progress Tracking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace instantaneous `visibilityRatio` with cumulative interval-based "seen ratio" as the basis for `targetRatio`, so that reading progress correctly accumulates when different parts of an element are visible at different times.

**Architecture:** A new `IntervalSet` class (pure math, no DOM) tracks which fraction of an element has ever been visible as merged `[start, end]` intervals. `TrackedElement` holds an `IntervalSet` and exposes `seenRatio`. The measurer computes the visible interval from each `IntersectionObserver` entry and feeds it to the tracked element. `#advanceTimers()` uses `seenRatio` instead of `visibilityRatio` for `targetRatio`.

**Tech Stack:** TypeScript, Bun (test runner), Biome (lint/format)

---

### Task 1: IntervalSet — failing tests

**Files:**
- Create: `packages/core/src/interval-set.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, expect, it } from 'bun:test'
import { IntervalSet } from './interval-set.js'

describe('IntervalSet', () => {
  it('starts empty with zero coverage', () => {
    const set = new IntervalSet()
    expect(set.coverage).toBe(0)
    expect(set.size).toBe(0)
    expect(set.intervals).toEqual([])
  })

  it('tracks a single interval', () => {
    const set = new IntervalSet()
    set.add(0.2, 0.5)
    expect(set.coverage).toBeCloseTo(0.3)
    expect(set.size).toBe(1)
    expect(set.intervals).toEqual([[0.2, 0.5]])
  })

  it('merges overlapping intervals', () => {
    const set = new IntervalSet()
    set.add(0.0, 0.4)
    set.add(0.3, 0.7)
    expect(set.coverage).toBeCloseTo(0.7)
    expect(set.size).toBe(1)
    expect(set.intervals).toEqual([[0.0, 0.7]])
  })

  it('merges adjacent intervals', () => {
    const set = new IntervalSet()
    set.add(0.0, 0.5)
    set.add(0.5, 1.0)
    expect(set.coverage).toBeCloseTo(1.0)
    expect(set.size).toBe(1)
    expect(set.intervals).toEqual([[0.0, 1.0]])
  })

  it('keeps disjoint intervals separate', () => {
    const set = new IntervalSet()
    set.add(0.0, 0.3)
    set.add(0.6, 1.0)
    expect(set.coverage).toBeCloseTo(0.7)
    expect(set.size).toBe(2)
    expect(set.intervals).toEqual([[0.0, 0.3], [0.6, 1.0]])
  })

  it('merges multiple overlapping intervals in one pass', () => {
    const set = new IntervalSet()
    set.add(0.0, 0.3)
    set.add(0.6, 1.0)
    // This bridges the gap
    set.add(0.2, 0.7)
    expect(set.coverage).toBeCloseTo(1.0)
    expect(set.size).toBe(1)
    expect(set.intervals).toEqual([[0.0, 1.0]])
  })

  it('clamps values to [0, 1]', () => {
    const set = new IntervalSet()
    set.add(-0.5, 1.5)
    expect(set.coverage).toBeCloseTo(1.0)
    expect(set.intervals).toEqual([[0.0, 1.0]])
  })

  it('ignores degenerate interval where start >= end after clamping', () => {
    const set = new IntervalSet()
    set.add(0.5, 0.5) // zero-width
    expect(set.coverage).toBe(0)
    expect(set.size).toBe(0)

    set.add(0.8, 0.3) // inverted
    expect(set.coverage).toBe(0)
    expect(set.size).toBe(0)
  })

  it('ignores NaN inputs', () => {
    const set = new IntervalSet()
    set.add(Number.NaN, 0.5)
    expect(set.coverage).toBe(0)

    set.add(0.0, Number.NaN)
    expect(set.coverage).toBe(0)
  })

  it('ignores Infinity inputs', () => {
    const set = new IntervalSet()
    set.add(Number.NEGATIVE_INFINITY, 0.5)
    expect(set.coverage).toBe(0)

    set.add(0.0, Number.POSITIVE_INFINITY)
    expect(set.coverage).toBe(0)
  })

  it('short-circuits add() when coverage is already 1.0', () => {
    const set = new IntervalSet()
    set.add(0.0, 1.0)
    expect(set.coverage).toBeCloseTo(1.0)

    // This should be a no-op
    set.add(0.2, 0.8)
    expect(set.size).toBe(1)
    expect(set.intervals).toEqual([[0.0, 1.0]])
  })

  it('clear() resets to empty', () => {
    const set = new IntervalSet()
    set.add(0.0, 0.5)
    set.add(0.7, 1.0)
    expect(set.coverage).toBeGreaterThan(0)

    set.clear()
    expect(set.coverage).toBe(0)
    expect(set.size).toBe(0)
    expect(set.intervals).toEqual([])
  })

  it('returns intervals sorted by start', () => {
    const set = new IntervalSet()
    set.add(0.7, 0.9)
    set.add(0.1, 0.3)
    expect(set.intervals).toEqual([[0.1, 0.3], [0.7, 0.9]])
  })

  it('intervals getter returns a read-only snapshot', () => {
    const set = new IntervalSet()
    set.add(0.0, 0.5)
    const intervals = set.intervals
    expect(intervals.length).toBe(1)

    // Adding more should not affect the previously returned array
    // (implementation detail — but verifies defensive copying or frozen array)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core && bun test src/interval-set.test.ts`
Expected: FAIL — `IntervalSet` module does not exist yet.

---

### Task 2: IntervalSet — implementation

**Files:**
- Create: `packages/core/src/interval-set.ts`

- [ ] **Step 1: Write the IntervalSet class**

```typescript
/**
 * Accumulates [start, end] intervals in the range 0–1 and merges overlapping
 * or adjacent ones. Used to track which fraction of a content element has
 * ever been visible in the viewport.
 */
export class IntervalSet {
  #intervals: [number, number][] = []

  /**
   * Add a visible interval. Values are clamped to [0, 1].
   * Degenerate, NaN, and Infinity inputs are silently ignored.
   */
  add(start: number, end: number): void {
    // Guard against non-finite inputs
    if (!Number.isFinite(start) || !Number.isFinite(end)) return

    // Clamp to [0, 1]
    const s = Math.max(0, Math.min(1, start))
    const e = Math.max(0, Math.min(1, end))

    // Degenerate interval
    if (s >= e) return

    // Short-circuit when already fully covered
    if (this.#intervals.length === 1 && this.#intervals[0]![0] === 0 && this.#intervals[0]![1] === 1) return

    this.#intervals.push([s, e])
    this.#merge()
  }

  /** Total covered fraction (0–1). */
  get coverage(): number {
    let total = 0
    for (const [s, e] of this.#intervals) {
      total += e - s
    }
    return total
  }

  /** Number of disjoint intervals currently stored. */
  get size(): number {
    return this.#intervals.length
  }

  /** The merged intervals, for diagnostic/overlay use. */
  get intervals(): ReadonlyArray<readonly [number, number]> {
    return this.#intervals.map(([s, e]) => [s, e] as const)
  }

  /** Reset to empty. */
  clear(): void {
    this.#intervals.length = 0
  }

  /** Sort by start, then merge overlapping/adjacent intervals in a single sweep. */
  #merge(): void {
    const iv = this.#intervals
    iv.sort((a, b) => a[0] - b[0])

    let write = 0
    for (let read = 1; read < iv.length; read++) {
      if (iv[read]![0] <= iv[write]![1]) {
        // Overlapping or adjacent — extend current
        iv[write]![1] = Math.max(iv[write]![1], iv[read]![1])
      } else {
        // Disjoint — advance write pointer
        write++
        iv[write] = iv[read]!
      }
    }
    iv.length = write + 1
  }
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd packages/core && bun test src/interval-set.test.ts`
Expected: All tests PASS.

- [ ] **Step 3: Run lint and typecheck**

Run: `bun run lint && bun run typecheck`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/interval-set.ts packages/core/src/interval-set.test.ts
git commit -m "Add IntervalSet class with unit tests"
```

---

### Task 3: TrackedElement — failing tests for seenRatio

**Files:**
- Modify: `packages/core/src/element.test.ts`

- [ ] **Step 1: Add tests for the new members**

Append to the existing `describe('TrackedElement', ...)` block, after the last `it(...)` (after line 101):

```typescript
  it('seenRatio starts at 0', () => {
    const el = new TrackedElement(mockElement('text'), READING_SPEED)
    expect(el.seenRatio).toBe(0)
  })

  it('seenIntervals starts empty', () => {
    const el = new TrackedElement(mockElement('text'), READING_SPEED)
    expect(el.seenIntervals).toEqual([])
  })

  it('addSeenInterval accumulates intervals and updates seenRatio', () => {
    const el = new TrackedElement(mockElement('text'), READING_SPEED)
    el.addSeenInterval(0.0, 0.3)
    expect(el.seenRatio).toBeCloseTo(0.3)
    expect(el.seenIntervals).toEqual([[0.0, 0.3]])
  })

  it('addSeenInterval merges overlapping intervals', () => {
    const el = new TrackedElement(mockElement('text'), READING_SPEED)
    el.addSeenInterval(0.0, 0.4)
    el.addSeenInterval(0.3, 0.7)
    expect(el.seenRatio).toBeCloseTo(0.7)
    expect(el.seenIntervals).toEqual([[0.0, 0.7]])
  })

  it('addSeenInterval tracks disjoint intervals', () => {
    const el = new TrackedElement(mockElement('text'), READING_SPEED)
    el.addSeenInterval(0.0, 0.3)
    el.addSeenInterval(0.6, 1.0)
    expect(el.seenRatio).toBeCloseTo(0.7)
    expect(el.seenIntervals).toEqual([[0.0, 0.3], [0.6, 1.0]])
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core && bun test src/element.test.ts`
Expected: FAIL — `seenRatio`, `seenIntervals`, and `addSeenInterval` do not exist yet.

---

### Task 4: TrackedElement — implementation

**Files:**
- Modify: `packages/core/src/element.ts:1,6-12` (import + new field)

- [ ] **Step 1: Add IntervalSet import and new members to TrackedElement**

In `element.ts`, add the import at line 1 (after the existing Timer import):

```typescript
import { IntervalSet } from './interval-set.js'
```

Add the private field after line 12 (`#hasBeenSeen = false`):

```typescript
  #seenIntervals = new IntervalSet()
```

Add the following getters and method after the `readingProgress` getter (after line 43):

```typescript
  /** Cumulative fraction (0–1) of this element that has ever been visible. */
  get seenRatio(): number {
    return this.#seenIntervals.coverage
  }

  /** The merged seen intervals, for diagnostic/overlay use. */
  get seenIntervals(): ReadonlyArray<readonly [number, number]> {
    return this.#seenIntervals.intervals
  }

  /**
   * Record a visible interval for this element.
   * @internal Used by Measurer — add-ons and external code must not call this.
   */
  addSeenInterval(start: number, end: number): void {
    this.#seenIntervals.add(start, end)
  }
```

- [ ] **Step 2: Run element tests to verify they pass**

Run: `cd packages/core && bun test src/element.test.ts`
Expected: All tests PASS (both existing and new).

- [ ] **Step 3: Run full test suite**

Run: `bun test`
Expected: All tests PASS. Existing measurer tests still pass because `visibilityRatio` is unchanged.

- [ ] **Step 4: Run lint and typecheck**

Run: `bun run lint && bun run typecheck`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/element.ts packages/core/src/element.test.ts
git commit -m "Add seenRatio and interval tracking to TrackedElement"
```

---

### Task 5: Measurer — failing test for interval-based targetRatio

**Files:**
- Modify: `packages/core/src/measurer.test.ts`

- [ ] **Step 1: Extend MockIntersectionObserver trigger to support geometry**

The existing `trigger()` method on `MockIntersectionObserver` only passes `target`, `intersectionRatio`, and `isIntersecting`. The measurer's `#handleIntersection()` will now read `boundingClientRect` and `rootBounds` from the entry. Update the `trigger` method (line 42-45) and add a new `triggerWithRect` helper:

Replace the existing `trigger` method (lines 42-45) with:

```typescript
  /** Test helper: simulate an intersection change with matching geometry. */
  trigger(target: Element, intersectionRatio: number, isIntersecting: boolean): void {
    // Synthesize geometry that produces the correct seen interval.
    // Element height = 100, viewport = ratio * 100. rectTop = 0 so the
    // visible fraction becomes [0, ratio]. When ratio = 0, viewportHeight = 0
    // produces a degenerate interval that is correctly skipped.
    const rectHeight = 100
    const viewportHeight = intersectionRatio * rectHeight
    const entry = {
      target,
      intersectionRatio,
      isIntersecting,
      boundingClientRect: { top: 0, height: rectHeight } as DOMRectReadOnly,
      rootBounds: { height: viewportHeight } as DOMRectReadOnly,
    } as IntersectionObserverEntry
    this.#callback([entry], this as unknown as IntersectionObserver)
  }

  /**
   * Test helper: simulate an intersection change with viewport geometry.
   * @param target - The observed element.
   * @param intersectionRatio - Fraction of the element visible (0–1).
   * @param isIntersecting - Whether the element is in the viewport.
   * @param rectTop - The element's top edge relative to the viewport (px).
   * @param rectHeight - The element's total height (px).
   * @param viewportHeight - The viewport height (px).
   */
  triggerWithRect(
    target: Element,
    intersectionRatio: number,
    isIntersecting: boolean,
    rectTop: number,
    rectHeight: number,
    viewportHeight: number,
  ): void {
    const entry = {
      target,
      intersectionRatio,
      isIntersecting,
      boundingClientRect: { top: rectTop, height: rectHeight } as DOMRectReadOnly,
      rootBounds: { height: viewportHeight } as DOMRectReadOnly,
    } as IntersectionObserverEntry
    this.#callback([entry], this as unknown as IntersectionObserver)
  }

  /** Test helper: simulate an IO entry with null rootBounds (disconnected observer). */
  triggerWithNull(target: Element, intersectionRatio: number, isIntersecting: boolean): void {
    const entry = {
      target,
      intersectionRatio,
      isIntersecting,
      boundingClientRect: { top: 0, height: 100 } as DOMRectReadOnly,
      rootBounds: null,
    } as IntersectionObserverEntry
    this.#callback([entry], this as unknown as IntersectionObserver)
  }
```

- [ ] **Step 2: Add the scroll-back scenario test**

Add inside the `describe('sequential reading', ...)` block, after the last `it(...)` (after line 725):

```typescript
    it('accumulates seen intervals across scroll-back (interval tracking)', () => {
      // 1380 chars = 60s at default speed. Element height = 1000px, viewport = 400px.
      const longText = 'x'.repeat(1380)
      setupDOM([longText])
      const measurer = new Measurer({ tickInterval: 200 })
      measurer.start()

      const p = document.querySelector('p')!

      // Step 1: Top 30% visible (element top at 0, bottom at 1000, viewport 400px).
      // rectTop = 0, rectHeight = 1000, viewport = 400 → visible [0, 0.4]
      // But we want top 30% → rectTop = 0, height = 1000, viewport = 300
      // start = max(0, -0/1000) = 0, end = min(1, 300/1000) = 0.3
      mockObserverInstance!.triggerWithRect(p, 0.3, true, 0, 1000, 300)

      // Advance enough time for ~20% reading progress
      jest.advanceTimersByTime(15000)
      const progressAfterTop = measurer.getElements()[0]!.readingProgress
      expect(progressAfterTop).toBeGreaterThan(0.15)
      expect(progressAfterTop).toBeLessThanOrEqual(0.3)

      // Step 2: Scroll up — bottom 40% visible.
      // rectTop = -600, height = 1000, viewport = 400
      // start = max(0, 600/1000) = 0.6, end = min(1, (400 - (-600))/1000) = 1.0
      mockObserverInstance!.triggerWithRect(p, 0.4, true, -600, 1000, 400)

      // seenRatio should now be 0.3 + 0.4 = 0.7 (disjoint intervals [0,0.3] ∪ [0.6,1.0])
      // Timer was at ~20%, targetRatio is now 0.7, so it can advance further
      jest.advanceTimersByTime(30000)
      const progressAfterBottom = measurer.getElements()[0]!.readingProgress
      // Should have advanced beyond 0.3 (the old cap), up toward 0.7
      expect(progressAfterBottom).toBeGreaterThan(0.5)
      expect(progressAfterBottom).toBeLessThanOrEqual(0.7 + 0.01)

      measurer.stop()
    })
```

- [ ] **Step 3: Add test for zero-height rect (no-op)**

Add inside the `describe('error resilience', ...)` block:

```typescript
    it('ignores IO entry with zero-height boundingClientRect', () => {
      const longText = 'x'.repeat(1380)
      setupDOM([longText])
      const measurer = new Measurer({ tickInterval: 200 })
      measurer.start()

      const p = document.querySelector('p')!

      // Trigger with zero-height rect — should not add any seen interval
      mockObserverInstance!.triggerWithRect(p, 0.5, true, 0, 0, 400)

      const elements = measurer.getElements()
      expect(elements[0]!.seenRatio).toBe(0)

      measurer.stop()
    })
```

- [ ] **Step 4: Add test for null rootBounds (no-op)**

Add inside the `describe('error resilience', ...)` block:

```typescript
    it('ignores IO entry with null rootBounds', () => {
      const longText = 'x'.repeat(1380)
      setupDOM([longText])
      const measurer = new Measurer({ tickInterval: 200 })
      measurer.start()

      const p = document.querySelector('p')!

      // Manually construct an entry with null rootBounds (simulates disconnected observer)
      mockObserverInstance!.triggerWithNull(p, 0.5, true)

      const elements = measurer.getElements()
      expect(elements[0]!.seenRatio).toBe(0)

      measurer.stop()
    })
```

- [ ] **Step 5: Run tests to verify new tests fail**

Run: `cd packages/core && bun test src/measurer.test.ts`
Expected: The new interval-tracking test and the null-rootBounds/zero-height tests FAIL because the measurer doesn't compute intervals yet. Existing tests continue to pass because `trigger()` now synthesizes geometry that produces matching `seenRatio` values, and the measurer still uses `visibilityRatio` for `targetRatio` (not yet changed).

- [ ] **Step 6: Commit the failing tests**

```bash
git add packages/core/src/measurer.test.ts
git commit -m "Add failing tests for interval-based targetRatio in measurer"
```

---

### Task 6: Measurer — implementation

**Files:**
- Modify: `packages/core/src/measurer.ts:9,214-231,291`

- [ ] **Step 1: Update default thresholds**

In `measurer.ts` line 9, change:

```typescript
  observerThresholds: [0, 0.25, 0.5, 0.75, 1.0],
```

to:

```typescript
  observerThresholds: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
```

- [ ] **Step 2: Add interval computation to #handleIntersection()**

In `measurer.ts`, in the `#handleIntersection()` method (lines 214-231), add the interval computation after `element.updateVisibility(entry)` (line 220) and before the scanning-depth block (line 222). Insert after line 220:

```typescript
      // Compute the visible interval from entry geometry and feed it to the element
      const rect = entry.boundingClientRect
      const rootBounds = entry.rootBounds
      if (rootBounds && rect.height > 0) {
        const start = Math.max(0, Math.min(1, -rect.top / rect.height))
        const end = Math.max(0, Math.min(1, (rootBounds.height - rect.top) / rect.height))
        if (start < end) {
          element.addSeenInterval(start, end)
        }
      }
```

- [ ] **Step 3: Change #advanceTimers() to use seenRatio**

In `measurer.ts` line 291, change:

```typescript
      element.timer.targetRatio = element.visibilityRatio
```

to:

```typescript
      element.timer.targetRatio = element.seenRatio
```

- [ ] **Step 4: Run all tests**

Run: `bun test`
Expected: All tests PASS. The `trigger()` helper (updated in Task 5) synthesizes geometry matching `intersectionRatio`, so existing tests produce correct `seenRatio` values. The new interval-tracking and edge-case tests also pass.

- [ ] **Step 5: Run lint and typecheck**

Run: `bun run lint && bun run typecheck`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/measurer.ts packages/core/src/measurer.test.ts
git commit -m "Use cumulative seen ratio for targetRatio instead of visibility ratio"
```

---

### Task 7: Export IntervalSet from index.ts

**Files:**
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Add the export**

In `index.ts`, after line 14 (`export { TrackedElement } from './element.js'`), add:

```typescript
export { IntervalSet } from './interval-set.js'
```

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "Export IntervalSet from core package index"
```

---

### Task 8: Update documentation

**Files:**
- Modify: `docs/algorithm.md`
- Modify: `docs/api-contracts.md`

- [ ] **Step 1: Update algorithm.md — default thresholds**

In `docs/algorithm.md`, in the Configuration section, change the `observerThresholds` default:

```
  /** IntersectionObserver threshold steps (array of ratios 0–1). Default: [0, 0.25, 0.5, 0.75, 1.0] */
  observerThresholds: number[]
```

to:

```
  /** IntersectionObserver threshold steps (array of ratios 0–1). Default: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0] */
  observerThresholds: number[]
```

- [ ] **Step 2: Update algorithm.md — IntersectionObserver callback section**

In section "2. IntersectionObserver callback", after the existing step 3 (updating `scanningDepth`), add a new step 4:

```
4. Compute the visible interval from entry geometry:
   - Let `rect = entry.boundingClientRect` and `rootBounds = entry.rootBounds`.
   - If `rootBounds` is null or `rect.height` is 0, skip interval computation.
   - `start = clamp(0, -rect.top / rect.height, 1)`
   - `end = clamp(0, (rootBounds.height - rect.top) / rect.height, 1)`
   - If `start < end`, call `element.addSeenInterval(start, end)` to accumulate the visible region.
   - The element's `seenRatio` (total coverage of all accumulated intervals) is used as `targetRatio` in the measurement tick.
```

- [ ] **Step 3: Update algorithm.md — measurement tick pseudocode**

In section "5. Measurement tick", in the pseudocode block, change:

```
        element.timer.targetRatio = element.visibilityRatio
```

to:

```
        element.timer.targetRatio = element.seenRatio
```

- [ ] **Step 4: Update algorithm.md — sequential reading model section**

In the "Sequential reading model" section, update point 2:

From:
```
2. **Target-ratio cap**: the timer's `targetRatio` is set to the element's `visibilityRatio`. This means reading progresses up to the visible boundary of the element, then stops — the reader cannot read what is not visible.
```

To:
```
2. **Target-ratio cap**: the timer's `targetRatio` is set to the element's `seenRatio` — the cumulative fraction of the element that has ever been visible, tracked as merged intervals. This means reading progresses up to the total seen boundary, then stops. Unlike the instantaneous visibility ratio, this correctly handles cases where different parts of the element were visible at different times (e.g., top visible on load, bottom visible after scroll-back).
```

- [ ] **Step 5: Update api-contracts.md — TrackedElement interface**

In `docs/api-contracts.md`, in the `TrackedElement` interface block, add these members after `readonly readingProgress: number`:

```typescript
  /** Cumulative fraction (0–1) of this element that has ever been visible. */
  readonly seenRatio: number

  /** The merged seen intervals, for diagnostic/overlay use. */
  readonly seenIntervals: ReadonlyArray<readonly [number, number]>

  /**
   * Record a visible interval for this element.
   * @internal Used by Measurer — add-ons and external code must not call this.
   */
  addSeenInterval(start: number, end: number): void
```

- [ ] **Step 6: Update api-contracts.md — default thresholds**

In the `MeasurerConfig` type comment, change:

```
  observerThresholds: number[]  // Default: [0, 0.25, 0.5, 0.75, 1.0]
```

to:

```
  observerThresholds: number[]  // Default: [0, 0.1, 0.2, ..., 0.9, 1.0]
```

And in the `MeasurerConfig` interface block in the same file, update the JSDoc:

```
  /** IntersectionObserver threshold steps (array of ratios 0–1). Default: `[0, 0.25, 0.5, 0.75, 1.0]` */
```

to:

```
  /** IntersectionObserver threshold steps (array of ratios 0–1). Default: `[0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]` */
```

- [ ] **Step 7: Update types.ts — default thresholds in JSDoc**

In `packages/core/src/types.ts`, update the JSDoc for `observerThresholds` (line 18):

```
  /** IntersectionObserver threshold steps (array of ratios 0–1). Default: `[0, 0.25, 0.5, 0.75, 1.0]` */
```

to:

```
  /** IntersectionObserver threshold steps (array of ratios 0–1). Default: `[0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]` */
```

- [ ] **Step 8: Run typecheck and lint**

Run: `bun run lint && bun run typecheck`
Expected: No errors.

- [ ] **Step 9: Commit**

```bash
git add docs/algorithm.md docs/api-contracts.md packages/core/src/types.ts
git commit -m "Update documentation for interval-based reading progress tracking"
```

---

### Task 9: Final verification

- [ ] **Step 1: Run full test suite**

Run: `bun test`
Expected: All tests PASS.

- [ ] **Step 2: Build all packages**

Run: `bun run build`
Expected: All packages build successfully.

- [ ] **Step 3: Run lint and typecheck**

Run: `bun run lint && bun run typecheck`
Expected: No errors.
