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

  it('advances timer at half speed for 50% visibility', () => {
    setupDOM(['Test content here'])
    const measurer = new Measurer({ tickInterval: 200 })
    measurer.start()

    const p = document.querySelector('p')!

    // Run at 100% visibility for one tick
    mockObserverInstance!.trigger(p, 1.0, true)
    jest.advanceTimersByTime(250)
    const fullReading = measurer.getMetrics().readingTime
    measurer.stop()

    // Fresh setup at 50% visibility
    document.body.innerHTML = ''
    setupDOM(['Test content here'])
    const measurer2 = new Measurer({ tickInterval: 200 })
    measurer2.start()
    const p2 = document.querySelector('p')!
    mockObserverInstance!.trigger(p2, 0.5, true)
    jest.advanceTimersByTime(250)
    const halfReading = measurer2.getMetrics().readingTime

    expect(halfReading).toBeCloseTo(fullReading / 2, 2)
    measurer2.stop()
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
    // 2 chars at 863 chars/min → duration ≈ 0.139s — one tick (0.2s) is enough
    setupDOM(['Hi'])
    const measurer = new Measurer({ tickInterval: 200, readingSpeed: 863 })
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
})
