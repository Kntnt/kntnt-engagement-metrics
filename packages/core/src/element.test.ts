import { describe, expect, it } from 'bun:test'
import { TrackedElement } from './element.js'

/**
 * Create a minimal mock DOM element with the given text content.
 */
function mockElement(text: string): Element {
  return { textContent: text } as unknown as Element
}

/**
 * Create a minimal mock IntersectionObserverEntry.
 */
function mockEntry(
  target: Element,
  intersectionRatio: number,
  isIntersecting: boolean,
): IntersectionObserverEntry {
  return { target, intersectionRatio, isIntersecting } as IntersectionObserverEntry
}

const READING_SPEED = 1380 // chars per minute (default)

describe('TrackedElement', () => {
  it('charCount reflects the text content length', () => {
    const node = mockElement('Hello, world!')
    const el = new TrackedElement(node, READING_SPEED)
    expect(el.charCount).toBe(13)
  })

  it('visibilityRatio starts at 0', () => {
    const el = new TrackedElement(mockElement('text'), READING_SPEED)
    expect(el.visibilityRatio).toBe(0)
  })

  it('hasBeenSeen starts as false', () => {
    const el = new TrackedElement(mockElement('text'), READING_SPEED)
    expect(el.hasBeenSeen).toBe(false)
  })

  it('hasBeenSeen becomes true on first intersecting entry', () => {
    const node = mockElement('text')
    const el = new TrackedElement(node, READING_SPEED)
    el.updateVisibility(mockEntry(node, 0.5, true))
    expect(el.hasBeenSeen).toBe(true)
  })

  it('hasBeenSeen never reverts to false', () => {
    const node = mockElement('text')
    const el = new TrackedElement(node, READING_SPEED)
    el.updateVisibility(mockEntry(node, 0.5, true))
    el.updateVisibility(mockEntry(node, 0, false))
    expect(el.hasBeenSeen).toBe(true)
  })

  it('visibilityRatio updates from IntersectionObserver entry', () => {
    const node = mockElement('text')
    const el = new TrackedElement(node, READING_SPEED)
    el.updateVisibility(mockEntry(node, 0.75, true))
    expect(el.visibilityRatio).toBe(0.75)
  })

  it('isFullyRead becomes true when the timer completes', () => {
    const node = mockElement('text')
    const el = new TrackedElement(node, READING_SPEED)
    expect(el.isFullyRead).toBe(false)

    // Advance the timer past its full duration
    el.timer.advance(el.timer.initialDuration + 1)
    expect(el.isFullyRead).toBe(true)
  })

  it('readingProgress matches the timer progress', () => {
    const node = mockElement('abcdefghij') // 10 chars
    const el = new TrackedElement(node, READING_SPEED)
    const halfDuration = el.timer.initialDuration / 2
    el.timer.advance(halfDuration)
    expect(el.readingProgress).toBeCloseTo(0.5)
  })

  it('zero-length text content: timer duration is 0, element is immediately fully read', () => {
    const el = new TrackedElement(mockElement(''), READING_SPEED)
    expect(el.charCount).toBe(0)
    expect(el.timer.initialDuration).toBe(0)
    expect(el.isFullyRead).toBe(true)
    expect(el.readingProgress).toBe(1)
  })

  it('calculates correct timer duration from text length and reading speed', () => {
    // 1380 chars at 1380 chars/min = 1 minute = 60 seconds
    const text = 'x'.repeat(1380)
    const el = new TrackedElement(mockElement(text), READING_SPEED)
    expect(el.timer.initialDuration).toBeCloseTo(60)
  })

  it('handles null textContent gracefully', () => {
    const node = { textContent: null } as unknown as Element
    const el = new TrackedElement(node, READING_SPEED)
    expect(el.charCount).toBe(0)
    expect(el.isFullyRead).toBe(true)
  })

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
    expect(el.seenIntervals).toEqual([
      [0.0, 0.3],
      [0.6, 1.0],
    ])
  })
})
