import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import type { EngagementMetrics } from '@kntnt/engagement-metrics'
import { GtagListener } from './listener.js'
import type { GtagConfig } from './types.js'

const DEFAULT_CONFIG: GtagConfig = {
  readingEventName: 'engagement_reading',
  scanningEventName: 'engagement_scanning',
  readingThresholds: [10, 25, 50, 75, 100],
  scanningThresholds: [25, 50, 75, 100],
  trackerMode: 'auto',
}

/** Create a metrics snapshot with the given overrides. */
function makeMetrics(overrides: Partial<EngagementMetrics> = {}): EngagementMetrics {
  return {
    readingTime: 0,
    contentTime: 60,
    readingLength: 0,
    contentLength: 1000,
    scanningDepth: 0,
    contentDepth: 2000,
    readingRatio: 0,
    scanningRatio: 0,
    isActive: true,
    ...overrides,
  }
}

describe('GtagListener', () => {
  let events: { name: string; params: Record<string, unknown> }[]

  beforeEach(() => {
    events = []
    ;(window as unknown as Record<string, unknown>).gtag = (
      command: string,
      name: string,
      params: Record<string, unknown>,
    ) => {
      if (command === 'event') {
        events.push({ name, params })
      }
    }
  })

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).gtag
  })

  it('sends events at configured reading thresholds', () => {
    const listener = new GtagListener(DEFAULT_CONFIG)

    listener.update(makeMetrics({ readingRatio: 0.11, readingTime: 5 }))
    expect(events.length).toBe(1)
    expect(events[0]?.name).toBe('engagement_reading')
    expect(events[0]?.params.percentage).toBe(10)
  })

  it('sends events at configured scanning thresholds', () => {
    const listener = new GtagListener(DEFAULT_CONFIG)

    listener.update(makeMetrics({ scanningRatio: 0.26, scanningDepth: 520 }))
    expect(events.length).toBe(1)
    expect(events[0]?.name).toBe('engagement_scanning')
    expect(events[0]?.params.percentage).toBe(25)
  })

  it('does not duplicate events on repeated updates', () => {
    const listener = new GtagListener(DEFAULT_CONFIG)

    listener.update(makeMetrics({ readingRatio: 0.3, readingTime: 10 }))
    const count = events.length

    listener.update(makeMetrics({ readingRatio: 0.3, readingTime: 10 }))
    expect(events.length).toBe(count)
  })

  it('uses custom event names from config', () => {
    const listener = new GtagListener({
      ...DEFAULT_CONFIG,
      readingEventName: 'custom_reading',
    })

    listener.update(makeMetrics({ readingRatio: 0.5, readingTime: 20 }))
    expect(events.some((e) => e.name === 'custom_reading')).toBe(true)
  })

  it('does not throw when gtag is missing', () => {
    delete (window as unknown as Record<string, unknown>).gtag

    const listener = new GtagListener(DEFAULT_CONFIG)
    expect(() => listener.update(makeMetrics({ readingRatio: 0.5 }))).not.toThrow()
  })

  it('survives a broken gtag function', () => {
    ;(window as unknown as Record<string, unknown>).gtag = () => {
      throw new Error('broken tracker')
    }

    const listener = new GtagListener(DEFAULT_CONFIG)
    expect(() => listener.update(makeMetrics({ readingRatio: 0.5 }))).not.toThrow()
  })
})
