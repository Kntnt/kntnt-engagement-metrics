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
    if (
      this.#intervals.length === 1 &&
      this.#intervals[0]?.[0] === 0 &&
      this.#intervals[0]?.[1] === 1
    )
      return

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
      const cur = iv[write] as [number, number]
      const next = iv[read] as [number, number]
      if (next[0] <= cur[1]) {
        // Overlapping or adjacent — extend current
        cur[1] = Math.max(cur[1], next[1])
      } else {
        // Disjoint — advance write pointer
        write++
        iv[write] = next
      }
    }
    iv.length = write + 1
  }
}
