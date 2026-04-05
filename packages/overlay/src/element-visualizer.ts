import type { TrackedElement } from '@kntnt/engagement-metrics'

/**
 * Applies visual styles to tracked content elements based on their reading state.
 *
 * Uses CSS outlines and gradient backgrounds to show which elements have been
 * read, are being read, are paused, or have not yet been seen.
 */
export class ElementVisualizer {
  readonly #elements: ReadonlyArray<TrackedElement>
  readonly #originalStyles = new Map<Element, { outline: string; background: string }>()

  constructor(elements: ReadonlyArray<TrackedElement>) {
    this.#elements = elements

    // Snapshot original styles so they can be restored on cleanup
    for (const element of elements) {
      const htmlEl = element.node as HTMLElement
      this.#originalStyles.set(element.node, {
        outline: htmlEl.style.outline,
        background: htmlEl.style.background,
      })
    }
  }

  /** Apply visual styles reflecting each element's current reading state. */
  apply(): void {
    for (const element of this.#elements) {
      if (!(element.node instanceof HTMLElement)) continue

      const style = element.node.style

      if (element.isFullyRead) {
        // Finished: green outline, light green background
        style.outline = '2px solid limegreen'
        style.background = 'rgba(0, 255, 127, 0.15)'
      } else if (!element.hasBeenSeen) {
        // Unseen: blue outline, no background
        style.outline = '2px solid dodgerblue'
        style.background = ''
      } else if (element.visibilityRatio > 0) {
        // Running: gold outline, gradient showing reading progress
        const pct = Math.round(element.readingProgress * 100)
        style.outline = '2px solid gold'
        style.background = `linear-gradient(to right, rgba(255, 215, 0, 0.25) ${pct}%, transparent ${pct}%)`
      } else {
        // Paused: red outline, no background
        style.outline = '2px solid tomato'
        style.background = ''
      }
    }
  }

  /** Restore all elements to their original styles. */
  cleanup(): void {
    for (const element of this.#elements) {
      const original = this.#originalStyles.get(element.node)
      if (!original || !(element.node instanceof HTMLElement)) continue
      element.node.style.outline = original.outline
      element.node.style.background = original.background
    }
  }
}
