/**
 * Test preload script that registers jsdom globals.
 * Used by Bun's test runner via bunfig.toml.
 */
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'https://localhost',
  pretendToBeVisual: true,
})

const { window } = dom

// Register essential DOM globals
const globalKeys = [
  'document',
  'HTMLElement',
  'Element',
  'Node',
  'Event',
  'CustomEvent',
  'DocumentFragment',
  'DOMParser',
  'MutationObserver',
  'NodeList',
  'HTMLCollection',
  'Text',
  'Comment',
  'navigator',
] as const

for (const key of globalKeys) {
  if (key in window) {
    Object.defineProperty(globalThis, key, {
      value: (window as Record<string, unknown>)[key],
      configurable: true,
      writable: true,
    })
  }
}

Object.defineProperty(globalThis, 'window', { value: window, configurable: true, writable: true })
Object.defineProperty(globalThis, 'self', { value: window, configurable: true, writable: true })

// Register animation frame APIs (jsdom provides them with pretendToBeVisual)
Object.defineProperty(globalThis, 'requestAnimationFrame', {
  value: window.requestAnimationFrame.bind(window),
  configurable: true,
  writable: true,
})
Object.defineProperty(globalThis, 'cancelAnimationFrame', {
  value: window.cancelAnimationFrame.bind(window),
  configurable: true,
  writable: true,
})
