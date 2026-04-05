import { afterEach, describe, expect, it } from 'bun:test'
import type {
  EngagementMetrics,
  Measurer,
  MetricsListener,
  TrackedElement,
} from '@kntnt/engagement-metrics'
import { EngagementOverlay } from './overlay.js'
import type { OverlayConfig } from './types.js'

const DEFAULT_CONFIG: OverlayConfig = {
  enabled: true,
  showHud: true,
  showElements: true,
  hudPosition: 'bottom-right',
  toggleKey: 'KeyD',
}

/** Create a mock measurer that tracks listener add/remove calls. */
function createMockMeasurer(elementCount = 2): {
  measurer: Measurer
  listeners: Set<MetricsListener>
  elements: TrackedElement[]
} {
  const listeners = new Set<MetricsListener>()
  const elements: TrackedElement[] = []

  for (let i = 0; i < elementCount; i++) {
    const el = document.createElement('p')
    el.textContent = `Paragraph ${i}`
    document.body.appendChild(el)
    elements.push({
      node: el,
      charCount: el.textContent.length,
      timer: { initialDuration: 5, remaining: 5, isComplete: false, progress: 0 },
      hasBeenSeen: false,
      isFullyRead: false,
      visibilityRatio: 0,
      readingProgress: 0,
      updateVisibility: () => {},
    } as unknown as TrackedElement)
  }

  const measurer = {
    addListener(listener: MetricsListener) {
      listeners.add(listener)
    },
    removeListener(listener: MetricsListener) {
      listeners.delete(listener)
    },
    getElements(): ReadonlyArray<TrackedElement> {
      return elements
    },
    getMetrics(): EngagementMetrics {
      return mockMetrics()
    },
    setReadingSpeed() {},
    isActive: true,
    start() {},
    stop() {},
  } as unknown as Measurer

  return { measurer, listeners, elements }
}

function mockMetrics(): EngagementMetrics {
  return {
    readingTime: 0,
    contentTime: 10,
    readingLength: 0,
    contentLength: 100,
    scanningDepth: 0,
    contentDepth: 1000,
    readingRatio: 0,
    scanningRatio: 0,
    isActive: true,
  }
}

describe('EngagementOverlay', () => {
  afterEach(() => {
    // Clean up HUD elements
    for (const el of document.querySelectorAll('[data-kntnt-overlay="hud"]')) {
      el.remove()
    }
    document.body.innerHTML = ''
  })

  it('registerOverlay adds overlay as listener to measurer', () => {
    const { measurer, listeners } = createMockMeasurer()
    const overlay = new EngagementOverlay(measurer, DEFAULT_CONFIG)

    expect(listeners.size).toBe(1)
    expect(listeners.has(overlay)).toBe(true)

    overlay.destroy()
  })

  it('update() when enabled applies element visualization and updates HUD', () => {
    const { measurer, elements } = createMockMeasurer()
    const overlay = new EngagementOverlay(measurer, DEFAULT_CONFIG)

    overlay.update(mockMetrics())

    // Elements should have outlines applied (unseen → blue)
    const style = (elements[0].node as HTMLElement).style
    expect(style.outline).toBe('2px solid dodgerblue')

    // HUD should exist
    expect(document.querySelector('[data-kntnt-overlay="hud"]')).not.toBeNull()

    overlay.destroy()
  })

  it('update() when disabled does nothing', () => {
    const { measurer, elements } = createMockMeasurer()
    const overlay = new EngagementOverlay(measurer, { ...DEFAULT_CONFIG, enabled: false })

    overlay.update(mockMetrics())

    // Elements should NOT have outlines
    const style = (elements[0].node as HTMLElement).style
    expect(style.outline).toBe('')

    // HUD should NOT exist
    expect(document.querySelector('[data-kntnt-overlay="hud"]')).toBeNull()

    overlay.destroy()
  })

  it('disable() cleans up element styles and removes HUD', () => {
    const { measurer, elements } = createMockMeasurer()
    const overlay = new EngagementOverlay(measurer, DEFAULT_CONFIG)

    overlay.update(mockMetrics())
    expect((elements[0].node as HTMLElement).style.outline).toBe('2px solid dodgerblue')

    overlay.disable()

    expect((elements[0].node as HTMLElement).style.outline).toBe('')
    expect(document.querySelector('[data-kntnt-overlay="hud"]')).toBeNull()

    overlay.destroy()
  })

  it('toggle() flips between enabled and disabled', () => {
    const { measurer } = createMockMeasurer()
    const overlay = new EngagementOverlay(measurer, DEFAULT_CONFIG)

    // Initially enabled
    expect(document.querySelector('[data-kntnt-overlay="hud"]')).not.toBeNull()

    overlay.toggle() // → disabled
    expect(document.querySelector('[data-kntnt-overlay="hud"]')).toBeNull()

    overlay.toggle() // → enabled
    expect(document.querySelector('[data-kntnt-overlay="hud"]')).not.toBeNull()

    overlay.destroy()
  })

  it('destroy() removes listener from measurer and cleans up DOM', () => {
    const { measurer, listeners } = createMockMeasurer()
    const overlay = new EngagementOverlay(measurer, DEFAULT_CONFIG)

    expect(listeners.size).toBe(1)

    overlay.destroy()

    expect(listeners.size).toBe(0)
    expect(document.querySelector('[data-kntnt-overlay="hud"]')).toBeNull()
  })

  it('Ctrl+Shift+D keyboard shortcut fires toggle()', () => {
    const { measurer } = createMockMeasurer()
    const overlay = new EngagementOverlay(measurer, DEFAULT_CONFIG)

    // Initially enabled, HUD present
    expect(document.querySelector('[data-kntnt-overlay="hud"]')).not.toBeNull()

    // Simulate Ctrl+Shift+D (jsdom doesn't expose KeyboardEvent globally)
    const event = new Event('keydown', { bubbles: true }) as Event & {
      code: string
      ctrlKey: boolean
      shiftKey: boolean
    }
    Object.assign(event, { code: 'KeyD', ctrlKey: true, shiftKey: true })
    document.dispatchEvent(event)

    // Should now be disabled
    expect(document.querySelector('[data-kntnt-overlay="hud"]')).toBeNull()

    overlay.destroy()
  })
})
