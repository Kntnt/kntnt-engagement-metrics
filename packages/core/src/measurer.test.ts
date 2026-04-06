import { afterEach, beforeEach, describe, expect, it, jest } from 'bun:test'
import { Measurer } from './measurer.js'
import type { EngagementMetrics, MetricsListener } from './types.js'

// Store the mock observer so tests can trigger intersection changes
let mockObserverInstance: MockIntersectionObserver | null = null

class MockIntersectionObserver {
  readonly root: Element | Document | null = null
  readonly rootMargin: string = '0px'
  readonly thresholds: ReadonlyArray<number> = []
  #callback: IntersectionObserverCallback
  #targets: Set<Element> = new Set()

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.#callback = callback
    this.thresholds = (options?.threshold as number[]) ?? [0]
    mockObserverInstance = this
  }

  observe(target: Element): void {
    this.#targets.add(target)
  }

  unobserve(target: Element): void {
    this.#targets.delete(target)
  }

  disconnect(): void {
    this.#targets.clear()
  }

  takeRecords(): IntersectionObserverEntry[] {
    return []
  }

  get targets(): Set<Element> {
    return this.#targets
  }

  /** Test helper: simulate an intersection change. */
  trigger(target: Element, intersectionRatio: number, isIntersecting: boolean): void {
    const entry = { target, intersectionRatio, isIntersecting } as IntersectionObserverEntry
    this.#callback([entry], this as unknown as IntersectionObserver)
  }
}

let originalIntersectionObserver: typeof IntersectionObserver
let originalRAF: typeof requestAnimationFrame
let originalCAF: typeof cancelAnimationFrame
let rafTime: number

/**
 * Create a document with paragraph elements for testing.
 */
function setupDOM(paragraphs: string[]): void {
  document.body.innerHTML = paragraphs.map((text) => `<p>${text}</p>`).join('')

  // jsdom doesn't implement offsetHeight, so we patch it
  for (const p of document.querySelectorAll('p')) {
    Object.defineProperty(p, 'offsetHeight', { value: 20, configurable: true })
  }
}

describe('Measurer', () => {
  beforeEach(() => {
    originalIntersectionObserver = globalThis.IntersectionObserver
    originalRAF = globalThis.requestAnimationFrame
    originalCAF = globalThis.cancelAnimationFrame
    globalThis.IntersectionObserver =
      MockIntersectionObserver as unknown as typeof IntersectionObserver
    mockObserverInstance = null

    // Replace requestAnimationFrame with a setTimeout-based version
    // so that jest.advanceTimersByTime() triggers callbacks.
    rafTime = 0
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      return setTimeout(() => {
        rafTime += 16
        cb(rafTime)
      }, 16) as unknown as number
    }) as typeof requestAnimationFrame
    globalThis.cancelAnimationFrame = ((id: number) => {
      clearTimeout(id)
    }) as typeof cancelAnimationFrame

    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
    globalThis.IntersectionObserver = originalIntersectionObserver
    globalThis.requestAnimationFrame = originalRAF
    globalThis.cancelAnimationFrame = originalCAF
    mockObserverInstance = null
    document.body.innerHTML = ''
  })

  it('finds the correct elements and creates TrackedElements', () => {
    setupDOM(['Hello world', 'Second paragraph'])
    const measurer = new Measurer({ selector: 'p' })
    measurer.start()
    const metrics = measurer.getMetrics()

    expect(metrics.contentLength).toBe('Hello world'.length + 'Second paragraph'.length)
    expect(metrics.isActive).toBe(true)

    measurer.stop()
  })

  it('skips elements with empty text content', () => {
    document.body.innerHTML = '<p>Real content</p><p></p><p>More content</p>'
    for (const p of document.querySelectorAll('p')) {
      Object.defineProperty(p, 'offsetHeight', { value: 20, configurable: true })
    }

    const measurer = new Measurer()
    measurer.start()
    const metrics = measurer.getMetrics()

    expect(metrics.contentLength).toBe('Real content'.length + 'More content'.length)
    measurer.stop()
  })

  it('does not start when no elements found', () => {
    document.body.innerHTML = '<div>No paragraphs here</div>'
    const measurer = new Measurer()
    measurer.start()

    expect(measurer.isActive).toBe(false)
    const metrics = measurer.getMetrics()
    expect(metrics.readingTime).toBe(0)
    expect(metrics.contentLength).toBe(0)
    expect(metrics.readingRatio).toBe(0)
  })

  it('updates visibility via IntersectionObserver', () => {
    setupDOM(['Test paragraph'])
    const measurer = new Measurer()
    measurer.start()

    const p = document.querySelector('p')!
    mockObserverInstance!.trigger(p, 1.0, true)

    const metrics = measurer.getMetrics()
    expect(metrics.contentLength).toBeGreaterThan(0)

    measurer.stop()
  })

  it('advances timers on tick when element is visible', () => {
    setupDOM(['Short text'])
    const measurer = new Measurer({ tickInterval: 200 })
    measurer.start()

    const p = document.querySelector('p')!
    mockObserverInstance!.trigger(p, 1.0, true)

    // Advance time past one tick interval
    jest.advanceTimersByTime(250)

    const metrics = measurer.getMetrics()
    expect(metrics.readingTime).toBeGreaterThan(0)

    measurer.stop()
  })

  it('caps reading progress at visibility ratio', () => {
    // 882 chars at 882 chars/min = 60s duration
    const longText = 'x'.repeat(882)
    setupDOM([longText])
    const measurer = new Measurer({ tickInterval: 200 })
    measurer.start()

    const p = document.querySelector('p')!
    mockObserverInstance!.trigger(p, 0.5, true)

    // Advance way more than enough time to read 50%
    jest.advanceTimersByTime(40000)
    const metrics = measurer.getMetrics()

    // Reading should be capped at ~50%, not 100%
    expect(metrics.readingRatio).toBeCloseTo(0.5, 1)
    expect(metrics.readingRatio).toBeLessThan(0.6)

    measurer.stop()
  })

  it('pauses timers when page is hidden', () => {
    setupDOM(['Visibility test text'])
    const measurer = new Measurer({ tickInterval: 200 })
    measurer.start()

    const p = document.querySelector('p')!
    mockObserverInstance!.trigger(p, 1.0, true)

    // Advance one tick
    jest.advanceTimersByTime(250)
    const beforeHide = measurer.getMetrics().readingTime
    expect(beforeHide).toBeGreaterThan(0)

    // Simulate page hidden
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    // Advance multiple ticks while hidden
    jest.advanceTimersByTime(1000)
    const whileHidden = measurer.getMetrics().readingTime
    expect(whileHidden).toBe(beforeHide)

    // Restore visibility
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    // Reading should advance again
    jest.advanceTimersByTime(250)
    const afterVisible = measurer.getMetrics().readingTime
    expect(afterVisible).toBeGreaterThan(beforeHide)

    measurer.stop()
  })

  it('notifies all registered listeners on each tick', () => {
    setupDOM(['Listener test'])
    const measurer = new Measurer({ tickInterval: 200 })

    const updates1: EngagementMetrics[] = []
    const updates2: EngagementMetrics[] = []
    const listener1: MetricsListener = { update: (m) => updates1.push({ ...m }) }
    const listener2: MetricsListener = { update: (m) => updates2.push({ ...m }) }

    measurer.addListener(listener1)
    measurer.addListener(listener2)
    measurer.start()

    const p = document.querySelector('p')!
    mockObserverInstance!.trigger(p, 1.0, true)
    jest.advanceTimersByTime(250)

    expect(updates1.length).toBeGreaterThan(0)
    expect(updates2.length).toBeGreaterThan(0)

    measurer.stop()
  })

  it('removing a listener stops its notifications', () => {
    setupDOM(['Remove listener test'])
    const measurer = new Measurer({ tickInterval: 200 })

    const updates: EngagementMetrics[] = []
    const listener: MetricsListener = { update: (m) => updates.push({ ...m }) }

    measurer.addListener(listener)
    measurer.start()

    const p = document.querySelector('p')!
    mockObserverInstance!.trigger(p, 1.0, true)
    jest.advanceTimersByTime(250)
    const countAfterFirst = updates.length

    measurer.removeListener(listener)
    jest.advanceTimersByTime(250)

    expect(updates.length).toBe(countAfterFirst)

    measurer.stop()
  })

  it('stop() cleans up and sets isActive to false', () => {
    setupDOM(['Cleanup test'])
    const measurer = new Measurer()
    measurer.start()

    expect(measurer.isActive).toBe(true)
    measurer.stop()
    expect(measurer.isActive).toBe(false)
  })

  it('readingRatio reaches 1.0 for fully read content', () => {
    // 2 chars at 882 chars/min → duration ≈ 0.136s — one tick (0.2s) is enough
    setupDOM(['Hi'])
    const measurer = new Measurer({ tickInterval: 200, readingSpeed: 882 })
    measurer.start()

    const p = document.querySelector('p')!
    mockObserverInstance!.trigger(p, 1.0, true)

    // Advance several ticks to ensure completion
    jest.advanceTimersByTime(600)

    const metrics = measurer.getMetrics()
    expect(metrics.readingRatio).toBeCloseTo(1.0)
  })

  it('metrics are all zeros when no content elements exist', () => {
    document.body.innerHTML = ''
    const measurer = new Measurer({ selector: 'p' })
    measurer.start()

    expect(measurer.isActive).toBe(false)
    const metrics = measurer.getMetrics()
    expect(metrics.readingTime).toBe(0)
    expect(metrics.contentTime).toBe(0)
    expect(metrics.readingLength).toBe(0)
    expect(metrics.contentLength).toBe(0)
    expect(metrics.readingRatio).toBe(0)
    expect(metrics.scanningRatio).toBe(0)
  })

  it('start() is idempotent', () => {
    setupDOM(['Idempotent test'])
    const measurer = new Measurer()
    measurer.start()
    measurer.start() // should not throw or duplicate elements

    const metrics = measurer.getMetrics()
    expect(metrics.contentLength).toBe('Idempotent test'.length)
    measurer.stop()
  })

  it('exclude filters out elements matching the exclude selector', () => {
    document.body.innerHTML =
      '<p>Keep this</p><p class="sidebar">Exclude this</p><p>Keep this too</p>'
    for (const p of document.querySelectorAll('p')) {
      Object.defineProperty(p, 'offsetHeight', { value: 20, configurable: true })
    }

    const measurer = new Measurer({ exclude: '.sidebar' })
    measurer.start()
    const metrics = measurer.getMetrics()

    expect(metrics.contentLength).toBe('Keep this'.length + 'Keep this too'.length)
    measurer.stop()
  })

  it('exclude filters out elements inside an ancestor matching exclude', () => {
    document.body.innerHTML =
      '<p>Keep</p><div class="nav"><p>Exclude nested</p></div><p>Also keep</p>'
    for (const p of document.querySelectorAll('p')) {
      Object.defineProperty(p, 'offsetHeight', { value: 20, configurable: true })
    }

    const measurer = new Measurer({ exclude: '.nav' })
    measurer.start()
    const metrics = measurer.getMetrics()

    expect(metrics.contentLength).toBe('Keep'.length + 'Also keep'.length)
    measurer.stop()
  })

  it('exclude does not filter when set to empty string (default)', () => {
    document.body.innerHTML = '<p class="sidebar">Not excluded</p><p>Also not excluded</p>'
    for (const p of document.querySelectorAll('p')) {
      Object.defineProperty(p, 'offsetHeight', { value: 20, configurable: true })
    }

    const measurer = new Measurer({ exclude: '' })
    measurer.start()
    const metrics = measurer.getMetrics()

    expect(metrics.contentLength).toBe('Not excluded'.length + 'Also not excluded'.length)
    measurer.stop()
  })

  it('elements not matching exclude are kept', () => {
    document.body.innerHTML =
      '<p class="content">Kept</p><p class="footer">Excluded</p><p class="content">Also kept</p>'
    for (const p of document.querySelectorAll('p')) {
      Object.defineProperty(p, 'offsetHeight', { value: 20, configurable: true })
    }

    const measurer = new Measurer({ exclude: '.footer' })
    measurer.start()
    const metrics = measurer.getMetrics()

    expect(metrics.contentLength).toBe('Kept'.length + 'Also kept'.length)
    measurer.stop()
  })

  describe('getElements()', () => {
    it('returns tracked elements matching selector', () => {
      setupDOM(['First', 'Second'])
      const measurer = new Measurer()
      measurer.start()

      const elements = measurer.getElements()
      expect(elements.length).toBe(2)
      expect(elements[0]?.charCount).toBe('First'.length)
      expect(elements[1]?.charCount).toBe('Second'.length)

      measurer.stop()
    })

    it('returns empty array before start()', () => {
      setupDOM(['Not started'])
      const measurer = new Measurer()

      expect(measurer.getElements()).toEqual([])
    })
  })

  describe('setReadingSpeed()', () => {
    it('recalibrates all element timers', () => {
      setupDOM(['Hello world'])
      const measurer = new Measurer({ readingSpeed: 882 })
      measurer.start()

      const contentTimeBefore = measurer.getMetrics().contentTime
      measurer.setReadingSpeed(882 * 2) // double the speed
      const contentTimeAfter = measurer.getMetrics().contentTime

      expect(contentTimeAfter).toBeCloseTo(contentTimeBefore / 2, 2)
      measurer.stop()
    })

    it('preserves existing reading progress', () => {
      setupDOM(['Some text here'])
      const measurer = new Measurer({ tickInterval: 200 })
      measurer.start()

      // Make element visible and advance one tick
      const p = document.querySelector('p')!
      mockObserverInstance!.trigger(p, 1.0, true)
      jest.advanceTimersByTime(250)

      const progressBefore = measurer.getElements()[0]?.readingProgress ?? 0
      expect(progressBefore).toBeGreaterThan(0)

      // Change reading speed
      measurer.setReadingSpeed(500)

      const progressAfter = measurer.getElements()[0]?.readingProgress ?? 0
      expect(progressAfter).toBeCloseTo(progressBefore, 5)

      measurer.stop()
    })

    it('rejects zero reading speed', () => {
      setupDOM(['Hello world'])
      const measurer = new Measurer()
      measurer.start()

      const contentTimeBefore = measurer.getMetrics().contentTime
      measurer.setReadingSpeed(0)
      const contentTimeAfter = measurer.getMetrics().contentTime

      // Timer should not have changed
      expect(contentTimeAfter).toBe(contentTimeBefore)
      measurer.stop()
    })

    it('rejects negative reading speed', () => {
      setupDOM(['Hello world'])
      const measurer = new Measurer()
      measurer.start()

      const contentTimeBefore = measurer.getMetrics().contentTime
      measurer.setReadingSpeed(-100)

      expect(measurer.getMetrics().contentTime).toBe(contentTimeBefore)
      measurer.stop()
    })

    it('rejects NaN reading speed', () => {
      setupDOM(['Hello world'])
      const measurer = new Measurer()
      measurer.start()

      const contentTimeBefore = measurer.getMetrics().contentTime
      measurer.setReadingSpeed(Number.NaN)

      expect(measurer.getMetrics().contentTime).toBe(contentTimeBefore)
      measurer.stop()
    })
  })

  describe('sequential reading', () => {
    it('only advances the topmost unfinished visible element', () => {
      setupDOM(['First paragraph', 'Second paragraph'])
      const measurer = new Measurer({ tickInterval: 200 })
      measurer.start()

      const paragraphs = document.querySelectorAll('p')
      mockObserverInstance!.trigger(paragraphs[0]!, 1.0, true)
      mockObserverInstance!.trigger(paragraphs[1]!, 1.0, true)

      jest.advanceTimersByTime(250)

      const elements = measurer.getElements()
      expect(elements[0]!.readingProgress).toBeGreaterThan(0)
      expect(elements[1]!.readingProgress).toBe(0)

      measurer.stop()
    })

    it('skips non-visible element and advances next visible one', () => {
      setupDOM(['Not visible', 'Visible paragraph'])
      const measurer = new Measurer({ tickInterval: 200 })
      measurer.start()

      const paragraphs = document.querySelectorAll('p')
      mockObserverInstance!.trigger(paragraphs[0]!, 0, false)
      mockObserverInstance!.trigger(paragraphs[1]!, 1.0, true)

      jest.advanceTimersByTime(250)

      const elements = measurer.getElements()
      expect(elements[0]!.readingProgress).toBe(0)
      expect(elements[1]!.readingProgress).toBeGreaterThan(0)

      measurer.stop()
    })

    it('caps reading at visibility ratio (target cap)', () => {
      const longText = 'x'.repeat(882) // 882 chars = 60 seconds at default speed
      setupDOM([longText])
      const measurer = new Measurer({ tickInterval: 200 })
      measurer.start()

      const p = document.querySelector('p')!
      mockObserverInstance!.trigger(p, 0.25, true)

      jest.advanceTimersByTime(20000)

      const elements = measurer.getElements()
      expect(elements[0]!.readingProgress).toBeCloseTo(0.25, 1)

      measurer.stop()
    })

    it('raising visibility allows further reading', () => {
      const longText = 'x'.repeat(882) // 60 seconds at default speed
      setupDOM([longText])
      const measurer = new Measurer({ tickInterval: 200 })
      measurer.start()

      const p = document.querySelector('p')!
      mockObserverInstance!.trigger(p, 0.25, true)
      jest.advanceTimersByTime(20000)

      mockObserverInstance!.trigger(p, 0.5, true)
      jest.advanceTimersByTime(20000)

      const elements = measurer.getElements()
      expect(elements[0]!.readingProgress).toBeCloseTo(0.5, 1)

      measurer.stop()
    })

    it('moves to next element when current is fully read', () => {
      // 2 chars → duration ≈ 0.139s, one tick (0.2s) is enough
      setupDOM(['Hi', 'By'])
      const measurer = new Measurer({ tickInterval: 200 })
      measurer.start()

      const paragraphs = document.querySelectorAll('p')
      mockObserverInstance!.trigger(paragraphs[0]!, 1.0, true)
      mockObserverInstance!.trigger(paragraphs[1]!, 1.0, true)

      jest.advanceTimersByTime(600)

      const elements = measurer.getElements()
      expect(elements[0]!.isFullyRead).toBe(true)
      expect(elements[1]!.readingProgress).toBeGreaterThan(0)

      measurer.stop()
    })

    it('resumes reading on scroll-back to partially-read element', () => {
      const longText = 'x'.repeat(882) // 60 seconds at default speed
      setupDOM([longText, 'Second'])
      const measurer = new Measurer({ tickInterval: 200 })
      measurer.start()

      const paragraphs = document.querySelectorAll('p')

      mockObserverInstance!.trigger(paragraphs[0]!, 0.25, true)
      jest.advanceTimersByTime(20000)
      const progressAt25 = measurer.getElements()[0]!.readingProgress

      mockObserverInstance!.trigger(paragraphs[0]!, 0, false)
      mockObserverInstance!.trigger(paragraphs[1]!, 1.0, true)
      jest.advanceTimersByTime(250)

      expect(measurer.getElements()[0]!.readingProgress).toBeCloseTo(progressAt25, 2)

      mockObserverInstance!.trigger(paragraphs[0]!, 0.5, true)
      mockObserverInstance!.trigger(paragraphs[1]!, 0, false)
      jest.advanceTimersByTime(20000)

      expect(measurer.getElements()[0]!.readingProgress).toBeCloseTo(0.5, 1)

      measurer.stop()
    })
  })

  describe('error resilience', () => {
    it('handles invalid selector gracefully', () => {
      setupDOM(['Hello'])
      const measurer = new Measurer({ selector: '>>>' })
      measurer.start()

      expect(measurer.isActive).toBe(false)
      expect(measurer.getMetrics().contentLength).toBe(0)
    })

    it('handles invalid exclude selector gracefully', () => {
      setupDOM(['Hello world'])
      const measurer = new Measurer({ selector: 'p', exclude: '>>>invalid' })
      measurer.start()

      // Should not throw, but may find no elements due to break
      expect(measurer.isActive).toBe(false)
    })

    it('continues notifying other listeners when one throws', () => {
      setupDOM(['Listener test'])
      const measurer = new Measurer({ tickInterval: 200 })

      const updates: EngagementMetrics[] = []
      const badListener: MetricsListener = {
        update: () => {
          throw new Error('Listener crash')
        },
      }
      const goodListener: MetricsListener = { update: (m) => updates.push({ ...m }) }

      measurer.addListener(badListener)
      measurer.addListener(goodListener)
      measurer.start()

      const p = document.querySelector('p')!
      mockObserverInstance!.trigger(p, 1.0, true)
      jest.advanceTimersByTime(250)

      // The good listener should still receive updates
      expect(updates.length).toBeGreaterThan(0)
      measurer.stop()
    })

    it('start/stop/start cycle works without duplicate elements', () => {
      setupDOM(['Cycle test'])
      const measurer = new Measurer()

      measurer.start()
      expect(measurer.getMetrics().contentLength).toBe('Cycle test'.length)
      measurer.stop()

      measurer.start()
      // Should have the same content length, not doubled
      expect(measurer.getMetrics().contentLength).toBe('Cycle test'.length)
      measurer.stop()
    })

    it('setReadingSpeed before start does not throw', () => {
      const measurer = new Measurer()
      // Should not throw when no elements exist
      expect(() => measurer.setReadingSpeed(500)).not.toThrow()
    })
  })
})
