import { describe, expect, it } from 'vitest'
import type { Rect, Size } from '../domain/board.ts'
import { keyboardConfig, noteConfig } from '../domain/config.ts'
import { applyKeyboardStep, type Direction, type KeyboardKind } from './keyboard.ts'

const board: Size = { width: 800, height: 600 }
const rect: Rect = { x: 100, y: 100, width: 200, height: 200 }

function step(
  kind: KeyboardKind,
  direction: Direction,
  options: { rect?: Rect; shift?: boolean } = {},
) {
  return applyKeyboardStep({
    rect: options.rect ?? rect,
    kind,
    direction,
    shift: options.shift ?? false,
    board,
  })
}

describe('move', () => {
  it('moves one step in each direction', () => {
    const s = keyboardConfig.step
    expect(step('move', 'left')).toEqual({ ...rect, x: 100 - s })
    expect(step('move', 'right')).toEqual({ ...rect, x: 100 + s })
    expect(step('move', 'up')).toEqual({ ...rect, y: 100 - s })
    expect(step('move', 'down')).toEqual({ ...rect, y: 100 + s })
  })

  it('moves a larger step with Shift', () => {
    expect(step('move', 'right', { shift: true })).toEqual({
      ...rect,
      x: 100 + keyboardConfig.shiftStep,
    })
  })

  it('clamps at all four edges', () => {
    expect(step('move', 'left', { rect: { ...rect, x: 4 } })?.x).toBe(0)
    expect(step('move', 'up', { rect: { ...rect, y: 4 } })?.y).toBe(0)
    expect(step('move', 'right', { rect: { ...rect, x: 596 } })?.x).toBe(600)
    expect(step('move', 'down', { rect: { ...rect, y: 396 } })?.y).toBe(400)
  })

  it('returns null when already at an edge', () => {
    expect(step('move', 'left', { rect: { ...rect, x: 0 } })).toBeNull()
    expect(step('move', 'up', { rect: { ...rect, y: 0 } })).toBeNull()
    expect(step('move', 'right', { rect: { ...rect, x: 600 } })).toBeNull()
    expect(step('move', 'down', { rect: { ...rect, y: 400 } })).toBeNull()
  })
})

describe('resize', () => {
  it('grows with right/down and shrinks with left/up', () => {
    const s = keyboardConfig.step
    expect(step('resize', 'right')).toEqual({ ...rect, width: 200 + s })
    expect(step('resize', 'down')).toEqual({ ...rect, height: 200 + s })
    expect(step('resize', 'left')).toEqual({ ...rect, width: 200 - s })
    expect(step('resize', 'up')).toEqual({ ...rect, height: 200 - s })
  })

  it('uses the larger step with Shift', () => {
    expect(step('resize', 'right', { shift: true })?.width).toBe(200 + keyboardConfig.shiftStep)
  })

  it('stops at the minimum size', () => {
    const small = { ...rect, width: noteConfig.minWidth + 4, height: noteConfig.minHeight + 4 }
    expect(step('resize', 'left', { rect: small })?.width).toBe(noteConfig.minWidth)
    expect(step('resize', 'up', { rect: small })?.height).toBe(noteConfig.minHeight)
    const atMin = { ...rect, width: noteConfig.minWidth, height: noteConfig.minHeight }
    expect(step('resize', 'left', { rect: atMin })).toBeNull()
    expect(step('resize', 'up', { rect: atMin })).toBeNull()
  })

  it('stops at the board edge', () => {
    expect(step('resize', 'right', { rect: { ...rect, x: 600, width: 196 } })?.width).toBe(200)
    expect(step('resize', 'down', { rect: { ...rect, y: 400, height: 196 } })?.height).toBe(200)
    expect(step('resize', 'right', { rect: { ...rect, x: 600 } })).toBeNull()
    expect(step('resize', 'down', { rect: { ...rect, y: 400 } })).toBeNull()
  })

  it('never grows a note that already overflows the board', () => {
    expect(step('resize', 'right', { rect: { ...rect, x: 700 } })).toBeNull()
    expect(step('resize', 'left', { rect: { ...rect, x: 700 } })?.width).toBe(190)
  })
})
