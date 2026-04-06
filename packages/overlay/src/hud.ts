import type { EngagementMetrics, Measurer, TrackedElement } from '@kntnt/engagement-metrics'
import type { OverlayConfig } from './types.js'

/** CSS for the HUD panel, injected into the shadow root. */
const HUD_STYLES = `
  :host {
    all: initial;
    position: fixed;
    z-index: 2147483647;
    font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
    font-size: 12px;
    line-height: 1.5;
    color: #e0e0e0;
    pointer-events: auto;
  }
  .container {
    background: rgba(0, 0, 0, 0.85);
    border-radius: 6px;
    padding: 12px 14px;
    min-width: 260px;
  }
  .title {
    font-weight: bold;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #999;
    margin-bottom: 8px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }
  .label {
    width: 70px;
    flex-shrink: 0;
  }
  .bar-track {
    flex: 1;
    height: 8px;
    background: #333;
    border-radius: 4px;
    overflow: hidden;
  }
  .bar-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.2s ease;
  }
  .bar-fill.reading {
    background: gold;
  }
  .bar-fill.scanning {
    background: dodgerblue;
  }
  .value {
    width: 90px;
    text-align: right;
    flex-shrink: 0;
  }
  .info {
    color: #999;
    margin-top: 4px;
    margin-bottom: 8px;
  }
  .speed-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
    border-top: 1px solid #333;
    padding-top: 8px;
  }
  .speed-label {
    flex-shrink: 0;
  }
  input[type="range"] {
    flex: 1;
    height: 4px;
    accent-color: gold;
    cursor: pointer;
  }
  input[type="number"] {
    width: 60px;
    background: #222;
    border: 1px solid #444;
    border-radius: 3px;
    color: #e0e0e0;
    font-family: inherit;
    font-size: 12px;
    padding: 2px 4px;
    text-align: right;
  }
  .speed-unit {
    color: #999;
    flex-shrink: 0;
  }
`

/** Position offsets for each HUD corner. */
const POSITION_STYLES: Record<OverlayConfig['hudPosition'], string> = {
  'top-left': 'top: 12px; left: 12px;',
  'top-right': 'top: 12px; right: 12px;',
  'bottom-left': 'bottom: 12px; left: 12px;',
  'bottom-right': 'bottom: 12px; right: 12px;',
}

/**
 * A fixed-position HUD panel that shows live engagement metrics.
 *
 * Uses Shadow DOM for complete style isolation from the host page.
 * Includes an interactive reading speed control (slider + numeric input).
 */
export class HudPanel {
  readonly #host: HTMLDivElement
  readonly #shadow: ShadowRoot
  readonly #measurer: Measurer

  // Metric display elements
  readonly #readingBar: HTMLDivElement
  readonly #readingValue: HTMLSpanElement
  readonly #scanningBar: HTMLDivElement
  readonly #scanningValue: HTMLSpanElement
  readonly #infoLine: HTMLDivElement
  readonly #statusLine: HTMLDivElement

  // Speed control elements
  readonly #speedSlider: HTMLInputElement
  readonly #speedInput: HTMLInputElement

  constructor(position: OverlayConfig['hudPosition'], measurer: Measurer) {
    this.#measurer = measurer

    // Create host element
    this.#host = document.createElement('div')
    this.#host.dataset.kntntOverlay = 'hud'
    this.#host.style.cssText = `position: fixed; ${POSITION_STYLES[position]}`

    // Attach shadow root
    this.#shadow = this.#host.attachShadow({ mode: 'closed' })

    // Inject styles
    const styleEl = document.createElement('style')
    styleEl.textContent = HUD_STYLES
    this.#shadow.appendChild(styleEl)

    // Build the panel structure
    const container = document.createElement('div')
    container.className = 'container'

    // Title
    const title = document.createElement('div')
    title.className = 'title'
    title.textContent = 'Engagement Metrics'
    container.appendChild(title)

    // Reading row
    const readingRow = this.#createBarRow('Reading', 'reading')
    this.#readingBar = readingRow.bar
    this.#readingValue = readingRow.value
    container.appendChild(readingRow.row)

    // Scanning row
    const scanningRow = this.#createBarRow('Scanning', 'scanning')
    this.#scanningBar = scanningRow.bar
    this.#scanningValue = scanningRow.value
    container.appendChild(scanningRow.row)

    // Info line (elements read/seen)
    this.#infoLine = document.createElement('div')
    this.#infoLine.className = 'info'
    container.appendChild(this.#infoLine)

    // Status line
    this.#statusLine = document.createElement('div')
    this.#statusLine.className = 'info'
    container.appendChild(this.#statusLine)

    // Speed control row
    const speedRow = document.createElement('div')
    speedRow.className = 'speed-row'

    const speedLabel = document.createElement('span')
    speedLabel.className = 'speed-label'
    speedLabel.textContent = 'Speed'
    speedRow.appendChild(speedLabel)

    this.#speedSlider = document.createElement('input')
    this.#speedSlider.type = 'range'
    this.#speedSlider.min = '100'
    this.#speedSlider.max = '3000'
    this.#speedSlider.step = '50'
    this.#speedSlider.value = '882'
    speedRow.appendChild(this.#speedSlider)

    this.#speedInput = document.createElement('input')
    this.#speedInput.type = 'number'
    this.#speedInput.min = '100'
    this.#speedInput.max = '3000'
    this.#speedInput.step = '50'
    this.#speedInput.value = '882'
    speedRow.appendChild(this.#speedInput)

    const unit = document.createElement('span')
    unit.className = 'speed-unit'
    unit.textContent = 'cpm'
    speedRow.appendChild(unit)

    container.appendChild(speedRow)
    this.#shadow.appendChild(container)

    // Wire up speed controls with bounds validation
    const applySpeed = (value: number) => {
      const clamped = Math.max(100, Math.min(3000, Math.round(value)))
      if (!Number.isFinite(clamped)) return
      this.#speedSlider.value = String(clamped)
      this.#speedInput.value = String(clamped)
      this.#measurer.setReadingSpeed(clamped)
    }

    this.#speedSlider.addEventListener('input', () => {
      applySpeed(Number(this.#speedSlider.value))
    })
    this.#speedInput.addEventListener('input', () => {
      applySpeed(Number(this.#speedInput.value))
    })

    // Append to document
    document.body.appendChild(this.#host)
  }

  /** Update the HUD with fresh metrics and element data. */
  update(metrics: EngagementMetrics, elements: ReadonlyArray<TrackedElement>): void {
    const readingPct = Math.round(metrics.readingRatio * 100)
    const scanningPct = Math.round(metrics.scanningRatio * 100)

    this.#readingBar.style.width = `${readingPct}%`
    this.#readingValue.textContent = `${readingPct}%  (${metrics.readingTime.toFixed(1)}s / ${metrics.contentTime.toFixed(1)}s)`

    this.#scanningBar.style.width = `${scanningPct}%`
    this.#scanningValue.textContent = `${scanningPct}%`

    const readCount = elements.filter((el) => el.isFullyRead).length
    const seenCount = elements.filter((el) => el.hasBeenSeen).length
    this.#infoLine.textContent = `Elements: ${readCount}/${elements.length} read \u00b7 ${seenCount}/${elements.length} seen`

    this.#statusLine.textContent = `Status: ${metrics.isActive ? 'Active' : 'Complete'}`
  }

  /** Show the HUD panel. */
  show(): void {
    this.#host.style.display = ''
  }

  /** Hide the HUD panel. */
  hide(): void {
    this.#host.style.display = 'none'
  }

  /** Remove the HUD panel from the DOM. */
  destroy(): void {
    this.#host.remove()
  }

  /** Create a labeled progress bar row. */
  #createBarRow(
    label: string,
    type: 'reading' | 'scanning',
  ): { row: HTMLDivElement; bar: HTMLDivElement; value: HTMLSpanElement } {
    const row = document.createElement('div')
    row.className = 'row'

    const labelEl = document.createElement('span')
    labelEl.className = 'label'
    labelEl.textContent = label
    row.appendChild(labelEl)

    const track = document.createElement('div')
    track.className = 'bar-track'

    const bar = document.createElement('div')
    bar.className = `bar-fill ${type}`
    bar.style.width = '0%'
    track.appendChild(bar)
    row.appendChild(track)

    const value = document.createElement('span')
    value.className = 'value'
    value.textContent = '0%'
    row.appendChild(value)

    return { row, bar, value }
  }
}
