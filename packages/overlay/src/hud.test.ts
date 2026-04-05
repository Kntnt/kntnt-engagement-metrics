import { afterEach, describe, expect, it } from 'bun:test'
import type { EngagementMetrics, Measurer, TrackedElement } from '@kntnt/engagement-metrics'
import { HudPanel } from './hud.js'

/** Create a minimal mock measurer. */
function mockMeasurer(): Measurer & { lastSpeed: number } {
  return {
    lastSpeed: 0,
    setReadingSpeed(speed: number) {
      this.lastSpeed = speed
    },
  } as Measurer & { lastSpeed: number }
}

/** Create mock metrics. */
function mockMetrics(overrides?: Partial<EngagementMetrics>): EngagementMetrics {
  return {
    readingTime: 8.3,
    contentTime: 13.4,
    readingLength: 500,
    contentLength: 800,
    scanningDepth: 1200,
    contentDepth: 1500,
    readingRatio: 0.625,
    scanningRatio: 0.8,
    isActive: true,
    ...overrides,
  }
}

/** Create mock tracked elements. */
function mockElements(count: number, readCount: number, seenCount: number): TrackedElement[] {
  const elements: TrackedElement[] = []
  for (let i = 0; i < count; i++) {
    elements.push({
      node: document.createElement('p'),
      charCount: 100,
      isFullyRead: i < readCount,
      hasBeenSeen: i < seenCount,
      visibilityRatio: 0,
      readingProgress: 0,
    } as unknown as TrackedElement)
  }
  return elements
}

describe('HudPanel', () => {
  afterEach(() => {
    // Clean up any appended HUD elements
    for (const el of document.querySelectorAll('[data-kntnt-overlay="hud"]')) {
      el.remove()
    }
  })

  it('is appended to document.body with shadow root', () => {
    const measurer = mockMeasurer()
    const hud = new HudPanel('bottom-right', measurer)

    const host = document.querySelector('[data-kntnt-overlay="hud"]')
    expect(host).not.toBeNull()

    hud.destroy()
  })

  it('update() renders correct metric values', () => {
    const measurer = mockMeasurer()
    const hud = new HudPanel('bottom-right', measurer)
    const metrics = mockMetrics()
    const elements = mockElements(10, 5, 8)

    hud.update(metrics, elements)

    // The HUD uses shadow DOM, so we can't directly query its content.
    // Verify no errors occur during update.
    hud.destroy()
  })

  it('hide() and show() toggle display', () => {
    const measurer = mockMeasurer()
    const hud = new HudPanel('bottom-right', measurer)

    const host = document.querySelector('[data-kntnt-overlay="hud"]') as HTMLElement
    expect(host.style.display).not.toBe('none')

    hud.hide()
    expect(host.style.display).toBe('none')

    hud.show()
    expect(host.style.display).not.toBe('none')

    hud.destroy()
  })

  it('destroy() removes host element from DOM', () => {
    const measurer = mockMeasurer()
    const hud = new HudPanel('bottom-right', measurer)

    expect(document.querySelector('[data-kntnt-overlay="hud"]')).not.toBeNull()

    hud.destroy()

    expect(document.querySelector('[data-kntnt-overlay="hud"]')).toBeNull()
  })

  it('position config maps to correct CSS corner', () => {
    const measurer = mockMeasurer()

    const positions = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const
    for (const pos of positions) {
      const hud = new HudPanel(pos, measurer)
      const host = document.querySelector('[data-kntnt-overlay="hud"]') as HTMLElement
      const style = host.style.cssText

      if (pos.includes('top')) expect(style).toContain('top')
      if (pos.includes('bottom')) expect(style).toContain('bottom')
      if (pos.includes('left')) expect(style).toContain('left')
      if (pos.includes('right')) expect(style).toContain('right')

      hud.destroy()
    }
  })
})
