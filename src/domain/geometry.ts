import type { Point, Rect, Size } from './board.ts'
import { noteConfig } from './config.ts'

export function rectFromPoints(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  }
}

export function enforceMinSize(size: Size): Size {
  return {
    width: Math.max(size.width, noteConfig.minWidth),
    height: Math.max(size.height, noteConfig.minHeight),
  }
}

export function clampRectToBoard(rect: Rect, board: Size): Rect {
  // max(0, ...) last: a rect bigger than the board aligns to the top-left.
  return {
    x: Math.max(0, Math.min(rect.x, board.width - rect.width)),
    y: Math.max(0, Math.min(rect.y, board.height - rect.height)),
    width: rect.width,
    height: rect.height,
  }
}

export function pointInRect(point: Point, rect: Rect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  )
}
