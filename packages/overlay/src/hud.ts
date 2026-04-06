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
  .controls-section {
    border-top: 1px solid #333;
    padding-top: 8px;
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .control-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .control-label {
    width: 65px;
    flex-shrink: 0;
  }
  .control-unit {
    color: #999;
    flex-shrink: 0;
    width: 30px;
  }
  input[type="range"] {
    flex: 1;
    accent-color: gold;
    cursor: pointer;
    margin: 4px 0;
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

    // Controls section
    const controlsSection = document.createElement('div')
    controlsSection.className = 'controls-section'

    // Reading speed control
    const speedControl = this.#createControlRow('Speed', 'cpm', {
      min: 50,
      max: 5000,
      step: 50,
      value: 882,
      onChange: (val) => this.#measurer.setReadingSpeed(val),
    })
    controlsSection.appendChild(speedControl.row)

    // Scroll cooldown control
    const cooldownControl = this.#createControlRow('Cooldown', 'ms', {
      min: 0,
      max: 2000,
      step: 50,
      value: 500,
      onChange: (val) => this.#measurer.setScrollCooldown(val),
    })
    controlsSection.appendChild(cooldownControl.row)

    // Scroll speed threshold control
    const scrollControl = this.#createControlRow('Scroll', 'px/s', {
      min: 10,
      max: 500,
      step: 10,
      value: 50,
      onChange: (val) => this.#measurer.setScrollSpeedThreshold(val),
    })
    controlsSection.appendChild(scrollControl.row)

    container.appendChild(controlsSection)
    this.#shadow.appendChild(container)

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

  /** Create a slider + number input control row with commit-on-blur/Enter semantics. */
  #createControlRow(
    label: string,
    unit: string,
    opts: {
      min: number
      max: number
      step: number
      value: number
      onChange: (value: number) => void
    },
  ): { row: HTMLDivElement; slider: HTMLInputElement; input: HTMLInputElement } {
    const row = document.createElement('div')
    row.className = 'control-row'

    const labelEl = document.createElement('span')
    labelEl.className = 'control-label'
    labelEl.textContent = label
    row.appendChild(labelEl)

    // Slider: retains step, applies immediately on input
    const slider = document.createElement('input')
    slider.type = 'range'
    slider.min = String(opts.min)
    slider.max = String(opts.max)
    slider.step = String(opts.step)
    slider.value = String(opts.value)
    row.appendChild(slider)

    // Number input: step="any" for free-form typing, commits on blur/Enter
    const input = document.createElement('input')
    input.type = 'number'
    input.min = String(opts.min)
    input.max = String(opts.max)
    input.step = 'any'
    input.value = String(opts.value)
    row.appendChild(input)

    const unitEl = document.createElement('span')
    unitEl.className = 'control-unit'
    unitEl.textContent = unit
    row.appendChild(unitEl)

    // Current effective value — used to restore on invalid input
    let currentValue = opts.value

    // Slider → apply immediately and sync text field
    slider.addEventListener('input', () => {
      const val = Number(slider.value)
      currentValue = val
      input.value = String(val)
      opts.onChange(val)
    })

    // Text field → commit on blur or Enter
    const commitInput = () => {
      const raw = Number(input.value)
      if (!Number.isFinite(raw)) {
        input.value = String(currentValue)
        return
      }
      const clamped = Math.max(opts.min, Math.min(opts.max, Math.round(raw)))
      currentValue = clamped
      input.value = String(clamped)
      slider.value = String(clamped)
      opts.onChange(clamped)
    }

    input.addEventListener('blur', commitInput)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        commitInput()
      }
    })

    return { row, slider, input }
  }
}
