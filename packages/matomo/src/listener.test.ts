import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import type { EngagementMetrics } from '@kntnt/engagement-metrics'
import { MatomoListener } from './listener.js'
import type { MatomoConfig } from './types.js'

const DEFAULT_CONFIG: MatomoConfig = {
  bounceThreshold: 0.1,
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

describe('MatomoListener', () => {
  let paq: unknown[][]

  beforeEach(() => {
    paq = []
    ;(window as unknown as Record<string, unknown>)._paq = paq
  })

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>)._paq
  })

  it('sends events at configured reading thresholds', () => {
    const listener = new MatomoListener(DEFAULT_CONFIG)

    listener.update(makeMetrics({ readingRatio: 0.11 }))
    expect(paq.length).toBe(1)
    expect(paq[0]?.[3]).toBe('10%')

    listener.update(makeMetrics({ readingRatio: 0.26 }))
    expect(paq.length).toBe(2)
    expect(paq[1]?.[3]).toBe('25%')
  })

  it('sends events at configured scanning thresholds', () => {
    const listener = new MatomoListener(DEFAULT_CONFIG)

    // scanningRatio 0.5 = 50%, which crosses both the 25% and 50% thresholds
    listener.update(makeMetrics({ scanningRatio: 0.5 }))
    expect(paq.length).toBe(2)
    expect(paq[0]?.[3]).toBe('25%')
    expect(paq[1]?.[3]).toBe('50%')
  })

  it('does not duplicate events on repeated updates', () => {
    const listener = new MatomoListener(DEFAULT_CONFIG)

    listener.update(makeMetrics({ readingRatio: 0.3 }))
    const count = paq.length

    // Same metrics again — no new events
    listener.update(makeMetrics({ readingRatio: 0.3 }))
    expect(paq.length).toBe(count)
  })

  it('does not throw when _paq is missing', () => {
    delete (window as unknown as Record<string, unknown>)._paq

    const listener = new MatomoListener(DEFAULT_CONFIG)
    expect(() => listener.update(makeMetrics({ readingRatio: 0.5 }))).not.toThrow()
  })

  it('survives a broken _paq.push', () => {
    ;(window as unknown as Record<string, unknown>)._paq = {
      push: () => {
        throw new Error('broken tracker')
      },
    }

    const listener = new MatomoListener(DEFAULT_CONFIG)
    expect(() => listener.update(makeMetrics({ readingRatio: 0.5 }))).not.toThrow()
  })
})
