import { expect, type Page, test } from '@playwright/test'

/**
 * Default reading speed (chars/min) matching the measurer default.
 */
const READING_SPEED = 1380

interface EngagementMetrics {
  readingTime: number
  contentTime: number
  readingLength: number
  contentLength: number
  scanningDepth: number
  contentDepth: number
  readingRatio: number
  scanningRatio: number
  isActive: boolean
}

/** Retrieve the current metrics snapshot from the page. */
async function getMetrics(page: Page): Promise<EngagementMetrics> {
  return page.evaluate(() => {
    const ns = (window as unknown as Record<string, unknown>).KntntEngagementMetrics as {
      measurer: { getMetrics(): EngagementMetrics }
    }
    return ns.measurer.getMetrics()
  })
}

/** Wait until a metrics condition is met, with a timeout. */
async function waitForMetrics(
  page: Page,
  predicate: string,
  timeout = 30_000,
): Promise<EngagementMetrics> {
  await page.waitForFunction(
    (pred) => {
      const ns = (window as unknown as Record<string, unknown>).KntntEngagementMetrics as
        | { measurer?: { getMetrics(): Record<string, number> } }
        | undefined
      if (!ns?.measurer) return false
      const m = ns.measurer.getMetrics()
      // The predicate is evaluated with `m` in scope
      return new Function('m', `return ${pred}`)(m) as boolean
    },
    predicate,
    { timeout },
  )
  return getMetrics(page)
}

/** Smoothly scroll to a target Y position over a given duration. */
async function smoothScrollTo(page: Page, targetY: number, durationMs: number): Promise<void> {
  const steps = Math.ceil(durationMs / 50)
  const startY = await page.evaluate(() => window.scrollY)
  for (let i = 1; i <= steps; i++) {
    const y = startY + (targetY - startY) * (i / steps)
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y)
    await page.waitForTimeout(50)
  }
}

/** Get the total scrollable height of the page. */
async function getScrollHeight(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
}

/** Get paragraph layout info for reading scenarios. */
async function getParagraphInfo(
  page: Page,
  speed: number,
): Promise<{ offsetTop: number; height: number; readingTimeMs: number }[]> {
  return page.evaluate((s) => {
    const elements = document.querySelectorAll('p')
    return Array.from(elements).map((el) => ({
      offsetTop: (el as HTMLElement).offsetTop,
      height: (el as HTMLElement).offsetHeight,
      readingTimeMs: ((el.textContent?.length ?? 0) / s) * 60 * 1000,
    }))
  }, speed)
}

test.describe('Overlay scenario', () => {
  test('Overlay shows visual indicators and responds to interaction', async ({ page }) => {
    await page.goto('/overlay')
    await page.waitForFunction(() => {
      const ns = (window as unknown as Record<string, unknown>).KntntEngagementMetrics as
        | { measurer?: { isActive: boolean } }
        | undefined
      return ns?.measurer?.isActive === true
    })

    // HUD panel should be visible
    const hudHost = page.locator('[data-kntnt-overlay="hud"]')
    await expect(hudHost).toBeVisible()

    // Wait for at least one measurement tick to fire (200ms default)
    await page.waitForTimeout(500)

    // The first paragraph should be visible and being read (gold outline)
    const firstP = page.locator('p').first()
    const runningOutline = await firstP.evaluate((el) => el.style.outline)
    expect(runningOutline).toContain('gold')

    // Wait until the first paragraph is fully read (green outline)
    const firstCharCount = await firstP.evaluate((el) => el.textContent?.length ?? 0)
    const firstReadingTimeMs = (firstCharCount / READING_SPEED) * 60 * 1000
    await page.waitForTimeout(firstReadingTimeMs + 5000)

    const finishedOutline = await firstP.evaluate((el) => el.style.outline)
    expect(finishedOutline).toContain('limegreen')

    // Change reading speed and verify contentTime decreases
    const contentTimeBefore = await page.evaluate(() => {
      const ns = (window as unknown as Record<string, unknown>).KntntEngagementMetrics as {
        measurer: { getMetrics(): { contentTime: number }; setReadingSpeed(s: number): void }
      }
      return ns.measurer.getMetrics().contentTime
    })

    await page.evaluate(() => {
      const ns = (window as unknown as Record<string, unknown>).KntntEngagementMetrics as {
        measurer: { setReadingSpeed(s: number): void }
      }
      ns.measurer.setReadingSpeed(1380 * 2)
    })

    const contentTimeAfter = await page.evaluate(() => {
      const ns = (window as unknown as Record<string, unknown>).KntntEngagementMetrics as {
        measurer: { getMetrics(): { contentTime: number } }
      }
      return ns.measurer.getMetrics().contentTime
    })

    expect(contentTimeAfter).toBeLessThan(contentTimeBefore)

    // Toggle overlay off via keyboard shortcut
    expect(await hudHost.isVisible()).toBe(true)

    await page.evaluate(() => {
      const event = new KeyboardEvent('keydown', {
        code: 'KeyD',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
      })
      document.dispatchEvent(event)
    })
    await page.waitForTimeout(300)

    const hudCount = await page.locator('[data-kntnt-overlay="hud"]').count()
    expect(hudCount).toBe(0)
  })
})

test.describe('Engagement metrics scenarios', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => {
      const ns = (window as unknown as Record<string, unknown>).KntntEngagementMetrics as
        | { measurer?: { isActive: boolean } }
        | undefined
      return ns?.measurer?.isActive === true
    })
  })

  test('Scenario 1: Bouncer — leaves almost immediately', async ({ page }) => {
    // Wait just 1 second — almost no reading should happen
    await page.waitForTimeout(1000)
    const metrics = await getMetrics(page)

    expect(metrics.readingRatio).toBeLessThan(0.15)
    expect(metrics.scanningRatio).toBeLessThan(0.5)
  })

  test('Scenario 2: Fast scroller — scrolls to bottom without pausing', async ({ page }) => {
    const scrollHeight = await getScrollHeight(page)

    // Scroll quickly to the bottom
    await smoothScrollTo(page, scrollHeight, 2000)

    // Wait for scroll cooldown, then check metrics
    await waitForMetrics(page, 'm.scanningRatio > 0.9')
    const metrics = await getMetrics(page)

    expect(metrics.scanningRatio).toBeGreaterThan(0.9)
    expect(metrics.readingRatio).toBeLessThan(0.15)
  })

  test('Scenario 3: Skimmer — scrolls with brief pauses', async ({ page }) => {
    const scrollHeight = await getScrollHeight(page)

    // 4 stops with 2-second pauses
    for (let i = 1; i <= 4; i++) {
      const targetY = (scrollHeight * i) / 4
      await smoothScrollTo(page, targetY, 1000)
      await page.waitForTimeout(2000)
    }

    const metrics = await getMetrics(page)

    expect(metrics.scanningRatio).toBeGreaterThan(0.9)
    expect(metrics.readingRatio).toBeGreaterThan(0.05)
    expect(metrics.readingRatio).toBeLessThan(0.6)
  })

  test('Scenario 4: Engaged reader — reads most content', async ({ page }) => {
    test.setTimeout(120_000)

    const paragraphs = await getParagraphInfo(page, READING_SPEED)

    // Read each paragraph by scrolling it into view and waiting
    for (const para of paragraphs) {
      await smoothScrollTo(page, Math.max(0, para.offsetTop - 100), 300)
      await page.waitForTimeout(para.readingTimeMs + 800)
    }

    // Wait until reading ratio reaches expected level
    const metrics = await waitForMetrics(page, 'm.readingRatio > 0.85', 15_000)

    expect(metrics.readingRatio).toBeGreaterThan(0.85)
    expect(metrics.scanningRatio).toBeGreaterThan(0.9)
  })

  test('Scenario 5: Partial reader — reads first half, then leaves', async ({ page }) => {
    test.setTimeout(90_000)

    const paragraphs = await getParagraphInfo(page, READING_SPEED)
    const halfIndex = Math.ceil(paragraphs.length / 2)
    const firstHalf = paragraphs.slice(0, halfIndex)

    for (const para of firstHalf) {
      await smoothScrollTo(page, Math.max(0, para.offsetTop - 100), 300)
      await page.waitForTimeout(para.readingTimeMs + 800)
    }

    const metrics = await getMetrics(page)

    expect(metrics.readingRatio).toBeGreaterThan(0.4)
    expect(metrics.readingRatio).toBeLessThan(0.75)
    expect(metrics.scanningRatio).toBeGreaterThan(0.3)
    expect(metrics.scanningRatio).toBeLessThan(0.85)
  })

  test('Scenario 6: Tab switcher — timers pause when page is hidden', async ({ page }) => {
    // Wait for some reading to occur
    await waitForMetrics(page, 'm.readingTime > 0.1', 5000)
    const t1 = (await getMetrics(page)).readingTime
    expect(t1).toBeGreaterThan(0)

    // Simulate tab switch via visibilitychange
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        writable: true,
        configurable: true,
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    // Wait 5 seconds while "hidden"
    await page.waitForTimeout(5000)

    // Restore visibility
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        writable: true,
        configurable: true,
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    // Wait briefly for reading to resume
    await page.waitForTimeout(1500)

    const t2 = (await getMetrics(page)).readingTime
    const elapsed = t2 - t1

    // Only ~1.5 seconds of visible time passed, not 6.5
    expect(elapsed).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(5)
  })
})
