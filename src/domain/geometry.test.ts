import { describe, expect, it } from 'vitest'
import { noteConfig } from './config.ts'
import { clampRectToBoard, enforceMinSize, pointInRect, rectFromPoints } from './geometry.ts'

describe('rectFromPoints', () => {
  it('normalizes any corner order', () => {
    const expected = { x: 10, y: 20, width: 30, height: 40 }
    expect(rectFromPoints({ x: 10, y: 20 }, { x: 40, y: 60 })).toEqual(expected)
    expect(rectFromPoints({ x: 40, y: 60 }, { x: 10, y: 20 })).toEqual(expected)
    expect(rectFromPoints({ x: 40, y: 20 }, { x: 10, y: 60 })).toEqual(expected)
    expect(rectFromPoints({ x: 10, y: 60 }, { x: 40, y: 20 })).toEqual(expected)
  })

  it('gives an empty rect for identical points', () => {
    expect(rectFromPoints({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({
      x: 5,
      y: 5,
      width: 0,
      height: 0,
    })
  })
})

describe('enforceMinSize', () => {
  it('raises each side to its minimum', () => {
    expect(enforceMinSize({ width: 1, height: 1 })).toEqual({
      width: noteConfig.minWidth,
      height: noteConfig.minHeight,
    })
  })

  it('raises only the side that is too small', () => {
    const big = noteConfig.minWidth + 100
    expect(enforceMinSize({ width: big, height: 1 })).toEqual({
      width: big,
      height: noteConfig.minHeight,
    })
  })

  it('keeps sizes at or above the minimum', () => {
    const size = { width: noteConfig.minWidth, height: noteConfig.minHeight }
    expect(enforceMinSize(size)).toEqual(size)
  })
})

describe('clampRectToBoard', () => {
  const board = { width: 1000, height: 800 }
  const size = { width: 200, height: 100 }

  it('leaves a rect that fits unchanged', () => {
    const rect = { x: 50, y: 60, ...size }
    expect(clampRectToBoard(rect, board)).toEqual(rect)
  })

  it('clamps at the left and top edges', () => {
    expect(clampRectToBoard({ x: -30, y: -40, ...size }, board)).toEqual({ x: 0, y: 0, ...size })
  })

  it('clamps at the right edge', () => {
    expect(clampRectToBoard({ x: 950, y: 10, ...size }, board)).toEqual({ x: 800, y: 10, ...size })
  })

  it('clamps at the bottom edge', () => {
    expect(clampRectToBoard({ x: 10, y: 790, ...size }, board)).toEqual({ x: 10, y: 700, ...size })
  })

  it('allows a rect touching the edges exactly', () => {
    const rect = { x: 800, y: 700, ...size }
    expect(clampRectToBoard(rect, board)).toEqual(rect)
  })

  it('aligns a rect bigger than the board to the top-left', () => {
    const rect = { x: 300, y: 300, width: 1200, height: 900 }
    expect(clampRectToBoard(rect, board)).toEqual({ x: 0, y: 0, width: 1200, height: 900 })
  })
})

describe('pointInRect', () => {
  const rect = { x: 10, y: 10, width: 100, height: 50 }

  it('is true inside and on the edges', () => {
    expect(pointInRect({ x: 50, y: 30 }, rect)).toBe(true)
    expect(pointInRect({ x: 10, y: 10 }, rect)).toBe(true)
    expect(pointInRect({ x: 110, y: 60 }, rect)).toBe(true)
  })

  it('is false outside on each side', () => {
    expect(pointInRect({ x: 9, y: 30 }, rect)).toBe(false)
    expect(pointInRect({ x: 111, y: 30 }, rect)).toBe(false)
    expect(pointInRect({ x: 50, y: 9 }, rect)).toBe(false)
    expect(pointInRect({ x: 50, y: 61 }, rect)).toBe(false)
  })
})
