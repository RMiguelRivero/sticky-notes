import type { Note, NoteId, Point, Rect, Size } from '../domain/board.ts'
import type { BoardAction } from '../domain/boardReducer.ts'
import { dragConfig, noteConfig } from '../domain/config.ts'
import { clampRectToBoard, enforceMinSize, rectFromPoints } from '../domain/geometry.ts'
import { assertNever } from '../utils/assertNever.ts'
import type { XOR } from '../utils/types/xor.ts'

export type IdleDrag = {
  readonly kind: 'idle'
}
export type CreatingDrag = {
  readonly kind: 'creating'
  readonly origin: Point
  readonly current: Point
}
export type MovingDrag = {
  readonly kind: 'moving'
  readonly noteId: NoteId
  readonly startRect: Rect
  readonly origin: Point
  readonly current: Point
  readonly overTrash: boolean
}
export type ResizingDrag = {
  readonly kind: 'resizing'
  readonly noteId: NoteId
  readonly startRect: Rect
  readonly origin: Point
  readonly current: Point
}

export type DragState = XOR<IdleDrag, CreatingDrag, MovingDrag, ResizingDrag>

export type DragContext = {
  readonly board: Size
  readonly overTrash: boolean
  readonly newNoteId: () => NoteId
}

export const idleDrag: DragState = { kind: 'idle' }

export function startCreating(point: Point): DragState {
  return { kind: 'creating', origin: point, current: point }
}

export function startMoving(note: Pick<Note, 'id' | 'rect'>, point: Point): DragState {
  return {
    kind: 'moving',
    noteId: note.id,
    startRect: note.rect,
    origin: point,
    current: point,
    overTrash: false,
  }
}

export function startResizing(note: Pick<Note, 'id' | 'rect'>, point: Point): DragState {
  return { kind: 'resizing', noteId: note.id, startRect: note.rect, origin: point, current: point }
}

export function update(
  state: DragState,
  point: Point,
  context: Pick<DragContext, 'overTrash'>,
): DragState {
  switch (state.kind) {
    case 'idle':
      return state
    case 'creating':
    case 'resizing':
      return { ...state, current: point }
    case 'moving':
      return { ...state, current: point, overTrash: context.overTrash }
    default:
      return assertNever(state)
  }
}

export function cancel(): DragState {
  return idleDrag
}

function passedThreshold(origin: Point, current: Point): boolean {
  return Math.hypot(current.x - origin.x, current.y - origin.y) >= dragConfig.threshold
}

export function isDragging(state: DragState): boolean {
  switch (state.kind) {
    case 'idle':
      return false
    case 'creating':
    case 'moving':
    case 'resizing':
      return passedThreshold(state.origin, state.current)
    default:
      return assertNever(state)
  }
}

function createdRect(origin: Point, current: Point, board: Size): Rect {
  const box = rectFromPoints(origin, current)
  return clampRectToBoard({ x: box.x, y: box.y, ...enforceMinSize(box) }, board)
}

function clickRect(origin: Point, board: Size): Rect {
  return clampRectToBoard(
    { x: origin.x, y: origin.y, width: noteConfig.defaultWidth, height: noteConfig.defaultHeight },
    board,
  )
}

function movedRect(startRect: Rect, origin: Point, current: Point, board: Size): Rect {
  return clampRectToBoard(
    {
      x: startRect.x + current.x - origin.x,
      y: startRect.y + current.y - origin.y,
      width: startRect.width,
      height: startRect.height,
    },
    board,
  )
}

function resizedRect(startRect: Rect, origin: Point, current: Point, board: Size): Rect {
  const wanted = enforceMinSize({
    width: startRect.width + current.x - origin.x,
    height: startRect.height + current.y - origin.y,
  })
  // Limit to the board edge first, then restore the minimum: min size wins over the edge.
  const limited = {
    width: Math.min(wanted.width, board.width - startRect.x),
    height: Math.min(wanted.height, board.height - startRect.y),
  }
  return { x: startRect.x, y: startRect.y, ...enforceMinSize(limited) }
}

/** The rect `finish` would commit for a create, move or resize; null when there is nothing to draw. */
export function previewRect(state: DragState, board: Size): Rect | null {
  switch (state.kind) {
    case 'idle':
      return null
    case 'creating':
      return isDragging(state) ? createdRect(state.origin, state.current, board) : null
    case 'moving':
      return isDragging(state)
        ? movedRect(state.startRect, state.origin, state.current, board)
        : null
    case 'resizing':
      return isDragging(state)
        ? resizedRect(state.startRect, state.origin, state.current, board)
        : null
    default:
      return assertNever(state)
  }
}

export function finish(state: DragState, context: DragContext): BoardAction | null {
  switch (state.kind) {
    case 'idle':
      return null
    case 'creating': {
      const rect = isDragging(state)
        ? createdRect(state.origin, state.current, context.board)
        : clickRect(state.origin, context.board)
      return { type: 'noteCreated', id: context.newNoteId(), rect }
    }
    case 'moving': {
      if (context.overTrash) return { type: 'noteDeleted', id: state.noteId }
      const rect = previewRect(state, context.board)
      return rect === null ? null : { type: 'noteMoved', id: state.noteId, rect }
    }
    case 'resizing': {
      const rect = previewRect(state, context.board)
      return rect === null ? null : { type: 'noteResized', id: state.noteId, rect }
    }
    default:
      return assertNever(state)
  }
}
