import { describe, expect, it } from 'bun:test'
import { Timer } from './timer.js'

describe('Timer', () => {
  it('starts with correct initialDuration and remaining', () => {
    const timer = new Timer(10)
    expect(timer.initialDuration).toBe(10)
    expect(timer.remaining).toBe(10)
  })

  it('advance() reduces remaining by the given seconds', () => {
    const timer = new Timer(10)
    timer.advance(3)
    expect(timer.remaining).toBe(7)
  })

  it('remaining never goes below zero', () => {
    const timer = new Timer(5)
    timer.advance(10)
    expect(timer.remaining).toBe(0)
  })

  it('isComplete returns true when remaining reaches zero', () => {
    const timer = new Timer(2)
    expect(timer.isComplete).toBe(false)
    timer.advance(2)
    expect(timer.isComplete).toBe(true)
  })

  it('isComplete returns true when remaining goes past zero', () => {
    const timer = new Timer(2)
    timer.advance(5)
    expect(timer.isComplete).toBe(true)
  })

  it('progress returns 0 at start', () => {
    const timer = new Timer(10)
    expect(timer.progress).toBe(0)
  })

  it('progress returns 1 at completion', () => {
    const timer = new Timer(10)
    timer.advance(10)
    expect(timer.progress).toBe(1)
  })

  it('progress returns proportional values in between', () => {
    const timer = new Timer(10)
    timer.advance(2.5)
    expect(timer.progress).toBe(0.25)
    timer.advance(5)
    expect(timer.progress).toBe(0.75)
  })

  it('zero-duration timer: isComplete is true immediately, progress is 1', () => {
    const timer = new Timer(0)
    expect(timer.isComplete).toBe(true)
    expect(timer.progress).toBe(1)
    expect(timer.remaining).toBe(0)
  })

  it('negative input to constructor is clamped to zero', () => {
    const timer = new Timer(-5)
    expect(timer.initialDuration).toBe(0)
    expect(timer.remaining).toBe(0)
    expect(timer.isComplete).toBe(true)
    expect(timer.progress).toBe(1)
  })

  it('multiple advance() calls accumulate correctly', () => {
    const timer = new Timer(10)
    timer.advance(1)
    timer.advance(2)
    timer.advance(3)
    expect(timer.remaining).toBe(4)
    expect(timer.progress).toBeCloseTo(0.6)
  })
})
