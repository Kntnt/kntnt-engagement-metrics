import { describe, expect, it } from 'bun:test'
import type { TrackedElement } from '@kntnt/engagement-metrics'
import { ElementVisualizer } from './element-visualizer.js'

/** Create a mock TrackedElement with the given state. */
function mockElement(state: {
  hasBeenSeen?: boolean
  isFullyRead?: boolean
  visibilityRatio?: number
  readingProgress?: number
}): TrackedElement {
  const el = document.createElement('p')
  el.textContent = 'Test paragraph'
  return {
    node: el,
    charCount: el.textContent.length,
    timer: {} as TrackedElement['timer'],
    hasBeenSeen: state.hasBeenSeen ?? false,
    isFullyRead: state.isFullyRead ?? false,
    visibilityRatio: state.visibilityRatio ?? 0,
    readingProgress: state.readingProgress ?? 0,
    updateVisibility: () => {},
  } as unknown as TrackedElement
}

describe('ElementVisualizer', () => {
  it('applies blue outline to unseen elements', () => {
    const element = mockElement({ hasBeenSeen: false })
    const visualizer = new ElementVisualizer([element])

    visualizer.apply()

    const style = (element.node as HTMLElement).style
    expect(style.outline).toBe('2px solid dodgerblue')
    expect(style.background).toBe('')
  })

  it('applies gold outline and gradient to running elements', () => {
    const element = mockElement({
      hasBeenSeen: true,
      visibilityRatio: 1.0,
      readingProgress: 0.5,
    })
    const visualizer = new ElementVisualizer([element])

    visualizer.apply()

    const style = (element.node as HTMLElement).style
    expect(style.outline).toBe('2px solid gold')
    expect(style.background).toContain('linear-gradient')
    expect(style.background).toContain('50%')
  })

  it('applies tomato outline to paused elements', () => {
    const element = mockElement({
      hasBeenSeen: true,
      visibilityRatio: 0,
      readingProgress: 0.3,
    })
    const visualizer = new ElementVisualizer([element])

    visualizer.apply()

    const style = (element.node as HTMLElement).style
    expect(style.outline).toBe('2px solid tomato')
    expect(style.background).toBe('')
  })

  it('applies green outline and background to finished elements', () => {
    const element = mockElement({
      isFullyRead: true,
      hasBeenSeen: true,
      readingProgress: 1.0,
    })
    const visualizer = new ElementVisualizer([element])

    visualizer.apply()

    const style = (element.node as HTMLElement).style
    expect(style.outline).toBe('2px solid limegreen')
    expect(style.background).toBe('rgba(0, 255, 127, 0.15)')
  })

  it('cleanup() restores original inline styles', () => {
    const element = mockElement({ hasBeenSeen: false })
    const htmlEl = element.node as HTMLElement
    htmlEl.style.outline = '1px dashed black'
    htmlEl.style.background = 'pink'

    const visualizer = new ElementVisualizer([element])
    visualizer.apply()

    expect(htmlEl.style.outline).toBe('2px solid dodgerblue')

    visualizer.cleanup()

    expect(htmlEl.style.outline).toBe('1px dashed black')
    expect(htmlEl.style.background).toBe('pink')
  })

  it('handles empty elements array without throwing', () => {
    const visualizer = new ElementVisualizer([])
    expect(() => visualizer.apply()).not.toThrow()
    expect(() => visualizer.cleanup()).not.toThrow()
  })
})
