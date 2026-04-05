import { expect, type Page, test } from '@playwright/test'

/**
 * Default reading speed (chars/min) matching the measurer default.
 * The test page uses 8 paragraphs of varying length (32–176 chars)
 * totaling ~801 chars → ~56s reading time at this speed.
 */
const READING_SPEED = 863

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
    await page.waitForTimeout(1000)
    const metrics = await getMetrics(page)

    // At 863 chars/min, 1 second reads ~14 chars out of ~801 total.
    // Visible paragraphs contribute partial progress proportional to visibility.
    expect(metrics.readingRatio).toBeLessThan(0.15)
    // Only the top few paragraphs are visible in the 400px viewport
    expect(metrics.scanningRatio).toBeLessThan(0.5)
  })

  test('Scenario 2: Fast scroller — scrolls to bottom without pausing', async ({ page }) => {
    const scrollHeight = await getScrollHeight(page)

    await smoothScrollTo(page, scrollHeight, 2000)
    await page.waitForTimeout(600)

    const metrics = await getMetrics(page)

    // Scanned everything, but scrolling too fast to read much
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

    // Scanned everything, read a moderate portion during pauses
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

    const metrics = await getMetrics(page)

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

    // First half is ~56% of total chars
    expect(metrics.readingRatio).toBeGreaterThan(0.4)
    expect(metrics.readingRatio).toBeLessThan(0.75)
    // Scanning includes the viewport height below the last scrolled position,
    // so reading halfway usually scans ~60–80% of a short page.
    expect(metrics.scanningRatio).toBeGreaterThan(0.3)
    expect(metrics.scanningRatio).toBeLessThan(0.85)
  })

  test('Scenario 6: Tab switcher — timers pause when page is hidden', async ({ page }) => {
    // Let some reading occur on visible paragraphs
    await page.waitForTimeout(3000)
    const t1 = (await getMetrics(page)).readingTime
    expect(t1).toBeGreaterThan(0)

    // Override visibilityState on the document instance to simulate a tab switch
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        writable: true,
        configurable: true,
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    // Wait 5 seconds while "hidden" — timers should NOT advance
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

    // Let 1 second of reading occur after restoring
    await page.waitForTimeout(1500)

    const t2 = (await getMetrics(page)).readingTime
    const elapsed = t2 - t1

    // Only ~1.5 seconds of visible time passed after resuming, not 6.5 seconds.
    // Allow some slack for timing imprecision in real browser.
    expect(elapsed).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(5)
  })
})
