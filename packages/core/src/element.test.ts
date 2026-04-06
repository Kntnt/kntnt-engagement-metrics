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
  // Shared node with 1380 chars → 60s reading time at default speed
  const node = mockElement('x'.repeat(1380))

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

  it('visibleStart, visibleEnd, and computedTargetRatio default to 0', () => {
    const el = new TrackedElement(node, READING_SPEED)
    expect(el.visibleStart).toBe(0)
    expect(el.visibleEnd).toBe(0)
    expect(el.computedTargetRatio).toBe(0)
  })

  it('updateVisibility stores current visible interval from entry geometry', () => {
    const el = new TrackedElement(node, READING_SPEED)
    // Element: top=0, height=1000. Viewport: height=300.
    // visible interval: [0, 0.3]
    el.updateVisibility({
      intersectionRatio: 0.3,
      isIntersecting: true,
      boundingClientRect: { top: 0, height: 1000 } as DOMRectReadOnly,
      rootBounds: { height: 300 } as DOMRectReadOnly,
    } as IntersectionObserverEntry)
    expect(el.visibleStart).toBeCloseTo(0, 5)
    expect(el.visibleEnd).toBeCloseTo(0.3, 5)
  })

  it('updateVisibility computes interval when element is partially above viewport', () => {
    const el = new TrackedElement(node, READING_SPEED)
    // Element: top=-600, height=1000. Viewport: height=400.
    // start = max(0, 600/1000) = 0.6, end = min(1, (400+600)/1000) = 1.0
    el.updateVisibility({
      intersectionRatio: 0.4,
      isIntersecting: true,
      boundingClientRect: { top: -600, height: 1000 } as DOMRectReadOnly,
      rootBounds: { height: 400 } as DOMRectReadOnly,
    } as IntersectionObserverEntry)
    expect(el.visibleStart).toBeCloseTo(0.6, 5)
    expect(el.visibleEnd).toBeCloseTo(1.0, 5)
  })

  it('updateVisibility resets visible interval when element leaves viewport', () => {
    const el = new TrackedElement(node, READING_SPEED)
    el.updateVisibility({
      intersectionRatio: 1.0,
      isIntersecting: true,
      boundingClientRect: { top: 0, height: 100 } as DOMRectReadOnly,
      rootBounds: { height: 100 } as DOMRectReadOnly,
    } as IntersectionObserverEntry)
    expect(el.visibleEnd).toBeCloseTo(1.0, 5)

    // Element scrolls out of view
    el.updateVisibility({
      intersectionRatio: 0,
      isIntersecting: false,
      boundingClientRect: { top: -200, height: 100 } as DOMRectReadOnly,
      rootBounds: { height: 800 } as DOMRectReadOnly,
    } as IntersectionObserverEntry)
    expect(el.visibleStart).toBe(0)
    expect(el.visibleEnd).toBe(0)
    expect(el.computedTargetRatio).toBe(0)
  })

  it('updateVisibility handles null rootBounds gracefully', () => {
    const el = new TrackedElement(node, READING_SPEED)
    el.updateVisibility({
      intersectionRatio: 0.5,
      isIntersecting: true,
      boundingClientRect: { top: 0, height: 100 } as DOMRectReadOnly,
      rootBounds: null,
    } as IntersectionObserverEntry)
    expect(el.visibleStart).toBe(0)
    expect(el.visibleEnd).toBe(0)
  })

  it('updateVisibility handles zero-height element gracefully', () => {
    const el = new TrackedElement(node, READING_SPEED)
    el.updateVisibility({
      intersectionRatio: 1.0,
      isIntersecting: true,
      boundingClientRect: { top: 0, height: 0 } as DOMRectReadOnly,
      rootBounds: { height: 800 } as DOMRectReadOnly,
    } as IntersectionObserverEntry)
    expect(el.visibleStart).toBe(0)
    expect(el.visibleEnd).toBe(0)
  })

  it('computedTargetRatio snapshots progress at time of IO callback', () => {
    const el = new TrackedElement(node, READING_SPEED)
    // Element fully visible, progress = 0 → targetRatio = 0 + max(0, 1.0 - max(0, 0)) = 1.0
    el.updateVisibility({
      intersectionRatio: 1.0,
      isIntersecting: true,
      boundingClientRect: { top: 0, height: 100 } as DOMRectReadOnly,
      rootBounds: { height: 100 } as DOMRectReadOnly,
    } as IntersectionObserverEntry)
    expect(el.computedTargetRatio).toBeCloseTo(1.0, 5)
  })

  it('computedTargetRatio accounts for current timer progress', () => {
    const el = new TrackedElement(node, READING_SPEED)
    // Simulate some reading: advance timer to 50% progress
    el.timer.targetRatio = 1.0
    el.timer.advance(30) // 30s of 60s total → 50% progress

    // Now only bottom 20% visible: [0.8, 1.0], progress = 0.5
    // targetRatio = 0.5 + max(0, 1.0 - max(0.8, 0.5)) = 0.5 + 0.2 = 0.7
    el.updateVisibility({
      intersectionRatio: 0.2,
      isIntersecting: true,
      boundingClientRect: { top: -800, height: 1000 } as DOMRectReadOnly,
      rootBounds: { height: 200 } as DOMRectReadOnly,
    } as IntersectionObserverEntry)
    expect(el.computedTargetRatio).toBeCloseTo(0.7, 5)
  })

  it('computedTargetRatio does not exceed 1', () => {
    const el = new TrackedElement(node, READING_SPEED)
    el.timer.targetRatio = 1.0
    el.timer.advance(50) // ~83% progress

    // Fully visible: progress=0.83, visible=[0,1], target=0.83+max(0,1-max(0,0.83))=0.83+0.17=1.0
    el.updateVisibility({
      intersectionRatio: 1.0,
      isIntersecting: true,
      boundingClientRect: { top: 0, height: 100 } as DOMRectReadOnly,
      rootBounds: { height: 100 } as DOMRectReadOnly,
    } as IntersectionObserverEntry)
    expect(el.computedTargetRatio).toBeLessThanOrEqual(1.0)
  })

  it('computedTargetRatio holds at progress when only already-read content is visible', () => {
    const el = new TrackedElement(node, READING_SPEED)
    el.timer.targetRatio = 1.0
    el.timer.advance(30) // 50% progress

    // Only top 30% visible — all already read: progress=0.5, visible=[0,0.3]
    // targetRatio = 0.5 + max(0, 0.3 - max(0, 0.5)) = 0.5 + 0 = 0.5
    el.updateVisibility({
      intersectionRatio: 0.3,
      isIntersecting: true,
      boundingClientRect: { top: 0, height: 1000 } as DOMRectReadOnly,
      rootBounds: { height: 300 } as DOMRectReadOnly,
    } as IntersectionObserverEntry)
    expect(el.computedTargetRatio).toBeCloseTo(0.5, 5)
  })
})
