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
    expect(set.intervals).toEqual([
      [0.0, 0.3],
      [0.6, 1.0],
    ])
  })

  it('merges multiple overlapping intervals in one pass', () => {
    const set = new IntervalSet()
    set.add(0.0, 0.3)
    set.add(0.6, 1.0)
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
    set.add(0.5, 0.5)
    expect(set.coverage).toBe(0)
    expect(set.size).toBe(0)

    set.add(0.8, 0.3)
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
    expect(set.intervals).toEqual([
      [0.1, 0.3],
      [0.7, 0.9],
    ])
  })

  it('intervals getter returns a read-only snapshot', () => {
    const set = new IntervalSet()
    set.add(0.0, 0.5)
    const snapshot = set.intervals
    // Mutating the snapshot must not affect internal state
    ;(snapshot as [number, number][])[0] = [0.9, 1.0]
    expect(set.intervals).toEqual([[0.0, 0.5]])
  })
})
