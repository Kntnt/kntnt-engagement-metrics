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
    // 1380 chars at 1380 chars/min = 60s duration
    const longText = 'x'.repeat(1380)
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
    // 2 chars at 1380 chars/min → duration ≈ 0.087s — one tick (0.2s) is enough
    setupDOM(['Hi'])
    const measurer = new Measurer({ tickInterval: 200, readingSpeed: 1380 })
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
      const measurer = new Measurer({ readingSpeed: 1380 })
      measurer.start()

      const contentTimeBefore = measurer.getMetrics().contentTime
      measurer.setReadingSpeed(1380 * 2) // double the speed
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

  describe('setScrollCooldown()', () => {
    it('accepts zero (disables cooldown)', () => {
      setupDOM(['Hello world'])
      const measurer = new Measurer({ scrollCooldown: 50 })
      measurer.start()

      expect(() => measurer.setScrollCooldown(0)).not.toThrow()
      measurer.stop()
    })

    it('accepts a positive value', () => {
      setupDOM(['Hello world'])
      const measurer = new Measurer({ scrollCooldown: 50 })
      measurer.start()

      expect(() => measurer.setScrollCooldown(1000)).not.toThrow()
      measurer.stop()
    })

    it('rejects negative values', () => {
      setupDOM(['Hello world'])
      const measurer = new Measurer({ scrollCooldown: 50 })
      measurer.start()

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      measurer.setScrollCooldown(-100)
      expect(warnSpy).toHaveBeenCalled()
      warnSpy.mockRestore()
      measurer.stop()
    })

    it('rejects NaN', () => {
      setupDOM(['Hello world'])
      const measurer = new Measurer()
      measurer.start()

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      measurer.setScrollCooldown(Number.NaN)
      expect(warnSpy).toHaveBeenCalled()
      warnSpy.mockRestore()
      measurer.stop()
    })

    it('rejects Infinity', () => {
      setupDOM(['Hello world'])
      const measurer = new Measurer()
      measurer.start()

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      measurer.setScrollCooldown(Number.POSITIVE_INFINITY)
      expect(warnSpy).toHaveBeenCalled()
      warnSpy.mockRestore()
      measurer.stop()
    })

    it('does not throw when called before start', () => {
      const measurer = new Measurer()
      expect(() => measurer.setScrollCooldown(1000)).not.toThrow()
    })
  })

  describe('setScrollSpeedThreshold()', () => {
    it('accepts a positive value', () => {
      setupDOM(['Hello world'])
      const measurer = new Measurer()
      measurer.start()

      expect(() => measurer.setScrollSpeedThreshold(100)).not.toThrow()
      measurer.stop()
    })

    it('rejects zero', () => {
      setupDOM(['Hello world'])
      const measurer = new Measurer()
      measurer.start()

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      measurer.setScrollSpeedThreshold(0)
      expect(warnSpy).toHaveBeenCalled()
      warnSpy.mockRestore()
      measurer.stop()
    })

    it('rejects negative values', () => {
      setupDOM(['Hello world'])
      const measurer = new Measurer()
      measurer.start()

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      measurer.setScrollSpeedThreshold(-50)
      expect(warnSpy).toHaveBeenCalled()
      warnSpy.mockRestore()
      measurer.stop()
    })

    it('rejects NaN', () => {
      setupDOM(['Hello world'])
      const measurer = new Measurer()
      measurer.start()

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      measurer.setScrollSpeedThreshold(Number.NaN)
      expect(warnSpy).toHaveBeenCalled()
      warnSpy.mockRestore()
      measurer.stop()
    })

    it('rejects Infinity', () => {
      setupDOM(['Hello world'])
      const measurer = new Measurer()
      measurer.start()

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      measurer.setScrollSpeedThreshold(Number.POSITIVE_INFINITY)
      expect(warnSpy).toHaveBeenCalled()
      warnSpy.mockRestore()
      measurer.stop()
    })

    it('does not throw when called before start', () => {
      const measurer = new Measurer()
      expect(() => measurer.setScrollSpeedThreshold(100)).not.toThrow()
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

    it('skips element at target and advances next visible element', () => {
      // Bug reproduction: element A is partially visible (at its target cap),
      // element B is fully visible. The tick loop should skip A and advance B.
      const longText = 'x'.repeat(1380) // 1380 chars = 60 seconds at default speed
      setupDOM([longText, longText])
      const measurer = new Measurer({ tickInterval: 200 })
      measurer.start()

      const paragraphs = document.querySelectorAll('p')

      // Step 1: Only last 10% of element B visible at viewport top.
      // triggerWithRect: rectTop, rectHeight, viewportHeight
      // Element B at rectTop=-90, height=100, viewport=100 → visible interval [0.9, 1.0]
      mockObserverInstance!.triggerWithRect(paragraphs[1]!, 0.1, true, -90, 100, 100)

      // Wait for B to reach its target (~10%)
      jest.advanceTimersByTime(10000)

      const elements = measurer.getElements()
      expect(elements[1]!.readingProgress).toBeCloseTo(0.1, 1)

      // Step 2: Scroll back up. Only last 10% of A visible, B is fully visible.
      mockObserverInstance!.triggerWithRect(paragraphs[0]!, 0.1, true, -90, 100, 100)
      mockObserverInstance!.triggerWithRect(paragraphs[1]!, 1.0, true, 0, 100, 100)

      // Wait for A to reach its target (~10%)
      jest.advanceTimersByTime(10000)

      expect(elements[0]!.readingProgress).toBeCloseTo(0.1, 1)

      // Step 3: A is at target, B is fully visible — B should now advance
      jest.advanceTimersByTime(10000)

      expect(elements[1]!.readingProgress).toBeGreaterThan(0.2)

      measurer.stop()
    })

    it('caps reading at visibility ratio (target cap)', () => {
      const longText = 'x'.repeat(1380) // 1380 chars = 60 seconds at default speed
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
      const longText = 'x'.repeat(1380) // 60 seconds at default speed
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
      // 2 chars → duration ≈ 0.087s, one tick (0.2s) is enough
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
      const longText = 'x'.repeat(1380) // 60 seconds at default speed
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

    it('accumulates seen intervals across scroll-back (interval tracking)', () => {
      // 1380 chars = 60s at default speed. Element height = 1000px, viewport = 400px.
      const longText = 'x'.repeat(1380)
      setupDOM([longText])
      const measurer = new Measurer({ tickInterval: 200 })
      measurer.start()

      const p = document.querySelector('p')!

      // Step 1: Top 30% visible (element top at 0, bottom at 1000, viewport 300px).
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

      // Progress is in (0.15, 0.3] after the top-half phase; visible = [0.6, 1.0]
      // targetRatio = progress + max(0, 1.0 - max(0.6, progress)) = progress + 0.4
      // So targetRatio is in (0.55, 0.70]
      jest.advanceTimersByTime(30000)
      const progressAfterBottom = measurer.getElements()[0]!.readingProgress
      // Should have advanced beyond 0.3 (the old cap), up toward snapshot target
      expect(progressAfterBottom).toBeGreaterThan(0.5)
      expect(progressAfterBottom).toBeLessThanOrEqual(0.71)

      measurer.stop()
    })

    it('caps targetRatio at current visibility, not cumulative seenRatio', () => {
      // THE BUG: element briefly fully visible → seenRatio = 1.0
      // Then scrolled so only last 10% visible → timer should NOT reach 100%.
      const longText = 'x'.repeat(1380) // 60s at default speed
      setupDOM([longText])
      const measurer = new Measurer({ tickInterval: 200 })
      measurer.start()

      const p = document.querySelector('p')!

      // Step 1: Element fully visible. computedTargetRatio → 1.0
      mockObserverInstance!.triggerWithRect(p, 1.0, true, 0, 1000, 1000)

      // Read for 3 seconds (5% of 60s)
      jest.advanceTimersByTime(3000)
      const progressBefore = measurer.getElements()[0]!.readingProgress
      expect(progressBefore).toBeCloseTo(0.05, 1)

      // Step 2: Scroll so only last 10% visible. visible = [0.9, 1.0], progress ≈ 0.05
      // Snapshot: targetRatio = 0.05 + max(0, 1.0 - max(0.9, 0.05)) = 0.05 + 0.1 = 0.15
      mockObserverInstance!.triggerWithRect(p, 0.1, true, -900, 1000, 100)

      // Advance way more than enough time
      jest.advanceTimersByTime(60000)

      const progressAfter = measurer.getElements()[0]!.readingProgress
      // Timer stops at the snapshot target (~0.15), NOT at seenRatio (1.0)
      expect(progressAfter).toBeCloseTo(0.15, 2)
      expect(progressAfter).toBeLessThan(0.2)

      measurer.stop()
    })

    it('does not advance beyond already-read region when only that region is visible', () => {
      const longText = 'x'.repeat(1380) // 60s
      setupDOM([longText])
      const measurer = new Measurer({ tickInterval: 200 })
      measurer.start()

      const p = document.querySelector('p')!

      // Read top 50% (element fully visible, read for 30s)
      mockObserverInstance!.triggerWithRect(p, 1.0, true, 0, 1000, 1000)
      jest.advanceTimersByTime(30000)
      const progress50 = measurer.getElements()[0]!.readingProgress
      expect(progress50).toBeCloseTo(0.5, 1)

      // Now only top 30% visible (already-read region).
      // Snapshot: progress=0.5, visible=[0,0.3], target = 0.5 + max(0, 0.3 - max(0, 0.5)) = 0.5
      mockObserverInstance!.triggerWithRect(p, 0.3, true, 0, 1000, 300)
      jest.advanceTimersByTime(10000)
      const progressAfter = measurer.getElements()[0]!.readingProgress
      expect(progressAfter).toBeCloseTo(0.5, 1)

      measurer.stop()
    })

    it('allows reading through partially overlapping visible region', () => {
      const longText = 'x'.repeat(1380) // 60s
      setupDOM([longText])
      const measurer = new Measurer({ tickInterval: 200 })
      measurer.start()

      const p = document.querySelector('p')!

      // Read top 30% (element visible [0, 0.5], read for 18s → progress ~0.3)
      mockObserverInstance!.triggerWithRect(p, 0.5, true, 0, 1000, 500)
      jest.advanceTimersByTime(18000)
      const progress30 = measurer.getElements()[0]!.readingProgress
      expect(progress30).toBeCloseTo(0.3, 1)

      // Scroll: visible [0.2, 0.8]. Snapshot at progress=0.3:
      // targetRatio = 0.3 + max(0, 0.8 - max(0.2, 0.3)) = 0.3 + 0.5 = 0.8
      mockObserverInstance!.triggerWithRect(p, 0.6, true, -200, 1000, 600)
      jest.advanceTimersByTime(40000)
      const progressAfter = measurer.getElements()[0]!.readingProgress
      expect(progressAfter).toBeCloseTo(0.8, 1)

      measurer.stop()
    })

    it('snapshot targetRatio does not slide as timer advances between IO callbacks', () => {
      const longText = 'x'.repeat(1380) // 60s
      setupDOM([longText])
      const measurer = new Measurer({ tickInterval: 200 })
      measurer.start()

      const p = document.querySelector('p')!

      // Read 20% with full visibility
      mockObserverInstance!.triggerWithRect(p, 1.0, true, 0, 1000, 1000)
      jest.advanceTimersByTime(12000)
      const progress20 = measurer.getElements()[0]!.readingProgress
      expect(progress20).toBeCloseTo(0.2, 1)

      // Scroll: bottom 40% visible [0.6, 1.0]. Snapshot at progress=0.2:
      // targetRatio = 0.2 + max(0, 1.0 - max(0.6, 0.2)) = 0.2 + 0.4 = 0.6
      mockObserverInstance!.triggerWithRect(p, 0.4, true, -600, 1000, 400)

      // Advance plenty of time — timer should stop at 0.6, NOT slide to 1.0
      jest.advanceTimersByTime(60000)
      const progressAfter = measurer.getElements()[0]!.readingProgress
      expect(progressAfter).toBeCloseTo(0.6, 1)
      expect(progressAfter).toBeLessThan(0.65)

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
  })
})
