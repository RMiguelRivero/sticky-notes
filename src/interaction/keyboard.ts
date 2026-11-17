import type { Rect, Size } from '../domain/board.ts'
import { keyboardConfig, noteConfig } from '../domain/config.ts'
import { clampRectToBoard, sameRect } from '../domain/geometry.ts'
import { assertNever } from '../utils/assertNever.ts'

export type KeyboardKind = 'move' | 'resize'
export type Direction = 'left' | 'right' | 'up' | 'down'

export type KeyboardIntent = {
  readonly rect: Rect
  readonly kind: KeyboardKind
  readonly direction: Direction
  readonly shift: boolean
  readonly board: Size
}

function delta(direction: Direction, step: number): { readonly dx: number; readonly dy: number } {
  switch (direction) {
    case 'left':
      return { dx: -step, dy: 0 }
    case 'right':
      return { dx: step, dy: 0 }
    case 'up':
      return { dx: 0, dy: -step }
    case 'down':
      return { dx: 0, dy: step }
    default:
      return assertNever(direction)
  }
}

// Growing stops at the board edge, shrinking stops at the minimum. A note that already
// breaks a limit (for example after the window shrank) is never pushed further out.
function resizeAxis(
  start: number,
  size: number,
  change: number,
  boardSize: number,
  min: number,
): number {
  const next = size + change
  if (change > 0) return Math.min(next, Math.max(size, boardSize - start))
  return Math.max(next, Math.min(size, min))
}

/** The note's new rect for one key press, or `null` when the press changes nothing. */
export function applyKeyboardStep({
  rect,
  kind,
  direction,
  shift,
  board,
}: KeyboardIntent): Rect | null {
  const { dx, dy } = delta(direction, shift ? keyboardConfig.shiftStep : keyboardConfig.step)
  let next: Rect
  switch (kind) {
    case 'move':
      next = clampRectToBoard({ ...rect, x: rect.x + dx, y: rect.y + dy }, board)
      break
    case 'resize':
      next = {
        ...rect,
        width: resizeAxis(rect.x, rect.width, dx, board.width, noteConfig.minWidth),
        height: resizeAxis(rect.y, rect.height, dy, board.height, noteConfig.minHeight),
      }
      break
    default:
      return assertNever(kind)
  }
  const unchanged = sameRect(rect, next)
  return unchanged ? null : next
}
