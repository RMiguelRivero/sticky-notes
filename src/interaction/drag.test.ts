import { describe, expect, it, vi } from 'vitest'
import type { Note, NoteId, Point, Rect, Size } from '../domain/board.ts'
import { createNoteId } from '../domain/board.ts'
import { dragConfig, noteConfig, snapConfig } from '../domain/config.ts'
import {
  cancel,
  createAtPoint,
  type DragContext,
  type DragState,
  finish,
  idleDrag,
  isDragging,
  previewRect,
  snapStepFor,
  startCreating,
  startMoving,
  startResizing,
  update,
} from './drag.ts'

const board: Size = { width: 1000, height: 800 }
const t = dragConfig.threshold
const noteId = createNoteId()
const newId = createNoteId()
const note: Pick<Note, 'id' | 'rect'> = {
  id: noteId,
  rect: { x: 100, y: 100, width: 200, height: 150 },
}

function ctx(overrides: Partial<DragContext> = {}): DragContext & { newNoteId: () => NoteId } {
  return { board, overTrash: false, newNoteId: () => newId, ...overrides }
}

function p(x: number, y: number): Point {
  return { x, y }
}

function dragTo(
  state: DragState,
  point: Point,
  overTrash = false,
  snapStep: number | null = null,
): DragState {
  return update(state, point, { overTrash, snapStep })
}

describe('start transitions', () => {
  it('startCreating sets origin and current', () => {
    expect(startCreating(p(5, 6))).toEqual({ kind: 'creating', origin: p(5, 6), current: p(5, 6) })
  })

  it('startMoving keeps the note rect and is not over trash', () => {
    expect(startMoving(note, p(110, 105))).toEqual({
      kind: 'moving',
      noteId,
      startRect: note.rect,
      origin: p(110, 105),
      current: p(110, 105),
      overTrash: false,
      snapStep: null,
    })
  })

  it('startResizing keeps the note rect', () => {
    expect(startResizing(note, p(300, 250))).toEqual({
      kind: 'resizing',
      noteId,
      startRect: note.rect,
      origin: p(300, 250),
      current: p(300, 250),
      snapStep: null,
    })
  })
})

describe('update', () => {
  it('returns the same state when idle', () => {
    expect(update(idleDrag, p(1, 1), { overTrash: true, snapStep: 10 })).toBe(idleDrag)
  })

  it('sets current when creating and resizing', () => {
    expect(dragTo(startCreating(p(0, 0)), p(9, 9))).toMatchObject({ current: p(9, 9) })
    expect(dragTo(startResizing(note, p(0, 0)), p(9, 9))).toMatchObject({ current: p(9, 9) })
  })

  it('stores overTrash only when moving', () => {
    expect(dragTo(startMoving(note, p(0, 0)), p(9, 9), true)).toMatchObject({
      current: p(9, 9),
      overTrash: true,
    })
    expect(dragTo(startCreating(p(0, 0)), p(9, 9), true)).not.toHaveProperty('overTrash')
  })

  it('stores the snap step when moving and resizing, not when creating', () => {
    expect(dragTo(startMoving(note, p(0, 0)), p(9, 9), false, 10)).toMatchObject({ snapStep: 10 })
    expect(dragTo(startResizing(note, p(0, 0)), p(9, 9), false, 30)).toMatchObject({ snapStep: 30 })
    expect(dragTo(startCreating(p(0, 0)), p(9, 9), false, 10)).not.toHaveProperty('snapStep')
  })

  it('does not mutate the previous state', () => {
    const before = startCreating(p(0, 0))
    dragTo(before, p(9, 9))
    expect(before).toEqual(startCreating(p(0, 0)))
  })
})

describe('cancel', () => {
  it.each([
    ['idle', idleDrag],
    ['creating', dragTo(startCreating(p(0, 0)), p(50, 50))],
    ['moving', dragTo(startMoving(note, p(0, 0)), p(50, 50), true)],
    ['resizing', dragTo(startResizing(note, p(0, 0)), p(50, 50))],
  ])('goes to idle from %s', (_name, _state) => {
    expect(cancel()).toEqual({ kind: 'idle' })
  })
})

describe('isDragging', () => {
  it('is false when idle', () => {
    expect(isDragging(idleDrag)).toBe(false)
  })

  it.each([
    ['creating', startCreating],
    ['moving', (pt: Point) => startMoving(note, pt)],
    ['resizing', (pt: Point) => startResizing(note, pt)],
  ])('%s: false below the threshold, true at it', (_name, start) => {
    expect(isDragging(dragTo(start(p(10, 10)), p(10 + t - 1, 10)))).toBe(false)
    expect(isDragging(dragTo(start(p(10, 10)), p(10 + t, 10)))).toBe(true)
    expect(isDragging(dragTo(start(p(10, 10)), p(10, 10 - t)))).toBe(true)
  })

  it('uses straight-line distance', () => {
    const d = Math.ceil(t / Math.SQRT2)
    expect(isDragging(dragTo(startCreating(p(0, 0)), p(d, d)))).toBe(true)
  })
})

describe('create', () => {
  it('draws the rect between origin and current in any direction', () => {
    const state = dragTo(startCreating(p(400, 400)), p(250, 250))
    expect(finish(state, ctx())).toEqual({
      type: 'noteCreated',
      id: newId,
      rect: { x: 250, y: 250, width: 150, height: 150 },
    })
  })

  it('enforces the minimum size', () => {
    const state = dragTo(startCreating(p(100, 100)), p(100 + t, 100 + t))
    expect(finish(state, ctx())).toMatchObject({
      rect: { x: 100, y: 100, width: noteConfig.minWidth, height: noteConfig.minHeight },
    })
  })

  it('clamps to the right and bottom edges', () => {
    const state = dragTo(startCreating(p(950, 780)), p(990, 799))
    expect(finish(state, ctx())).toMatchObject({
      rect: { x: 1000 - noteConfig.minWidth, y: 800 - noteConfig.minHeight },
    })
  })

  it('clamps to the left and top edges', () => {
    const state = dragTo(startCreating(p(-30, -20)), p(-30 + t, -20 + t))
    expect(finish(state, ctx())).toMatchObject({ rect: { x: 0, y: 0 } })
  })

  it('a plain click creates nothing', () => {
    const state = dragTo(startCreating(p(300, 200)), p(300 + t - 1, 200))
    expect(finish(state, ctx())).toBeNull()
  })

  it('a board smaller than the note pins it to the top-left', () => {
    const tiny: Size = { width: 50, height: 50 }
    const state = dragTo(startCreating(p(20, 20)), p(40, 40))
    expect(finish(state, ctx({ board: tiny }))).toMatchObject({ rect: { x: 0, y: 0 } })
  })

  it('does not set a color (the reducer picks the default)', () => {
    expect(finish(dragTo(startCreating(p(1, 1)), p(300, 300)), ctx())).not.toHaveProperty('color')
  })

  it('ignores overTrash', () => {
    const state = dragTo(startCreating(p(100, 100)), p(300, 300), true)
    expect(finish(state, ctx({ overTrash: true }))?.type).toBe('noteCreated')
  })

  it('calls newNoteId exactly once', () => {
    const newNoteId = vi.fn(() => newId)
    finish(dragTo(startCreating(p(0, 0)), p(300, 300)), ctx({ newNoteId }))
    expect(newNoteId).toHaveBeenCalledTimes(1)
  })
})

describe('createAtPoint (double-click)', () => {
  const context = { board, newNoteId: () => newId }

  it('makes a default-size note with its top-left corner at the point', () => {
    expect(createAtPoint(p(300, 200), context)).toEqual({
      type: 'noteCreated',
      id: newId,
      rect: { x: 300, y: 200, width: noteConfig.defaultWidth, height: noteConfig.defaultHeight },
    })
  })

  it('clamps near the edge', () => {
    expect(createAtPoint(p(990, 790), context)).toMatchObject({
      rect: {
        x: 1000 - noteConfig.defaultWidth,
        y: 800 - noteConfig.defaultHeight,
        width: noteConfig.defaultWidth,
        height: noteConfig.defaultHeight,
      },
    })
  })
})

describe('move', () => {
  it('offsets the start rect by the pointer delta', () => {
    const state = dragTo(startMoving(note, p(120, 110)), p(170, 90))
    expect(finish(state, ctx())).toEqual({
      type: 'noteMoved',
      id: noteId,
      rect: { x: 150, y: 80, width: 200, height: 150 },
    })
  })

  it('clamps at each board edge', () => {
    const at = (x: number, y: number) => finish(dragTo(startMoving(note, p(0, 0)), p(x, y)), ctx())
    expect(at(-500, 0)).toMatchObject({ rect: { x: 0, y: 100 } })
    expect(at(0, -500)).toMatchObject({ rect: { x: 100, y: 0 } })
    expect(at(2000, 0)).toMatchObject({ rect: { x: 800, y: 100 } })
    expect(at(0, 2000)).toMatchObject({ rect: { x: 100, y: 650 } })
  })

  it('pins a note larger than the board to the top-left', () => {
    const tiny: Size = { width: 100, height: 100 }
    const state = dragTo(startMoving(note, p(0, 0)), p(30, 30))
    expect(finish(state, ctx({ board: tiny }))).toMatchObject({
      rect: { x: 0, y: 0, width: 200, height: 150 },
    })
  })

  it('a click on the header does nothing', () => {
    const state = dragTo(startMoving(note, p(0, 0)), p(t - 1, 0))
    expect(finish(state, ctx())).toBeNull()
    expect(finish(startMoving(note, p(0, 0)), ctx())).toBeNull()
  })

  it('deletes the note when released over the trash', () => {
    const state = dragTo(startMoving(note, p(0, 0)), p(300, 300), true)
    expect(finish(state, ctx({ overTrash: true }))).toEqual({ type: 'noteDeleted', id: noteId })
  })

  it('moves normally when not over the trash', () => {
    const state = dragTo(startMoving(note, p(0, 0)), p(300, 300), true)
    expect(finish(state, ctx({ overTrash: false }))?.type).toBe('noteMoved')
  })
})

describe('resize', () => {
  it('keeps the top-left and adds the delta to the size', () => {
    const state = dragTo(startResizing(note, p(300, 250)), p(350, 290))
    expect(finish(state, ctx())).toEqual({
      type: 'noteResized',
      id: noteId,
      rect: { x: 100, y: 100, width: 250, height: 190 },
    })
  })

  it('enforces the minimum size', () => {
    const state = dragTo(startResizing(note, p(300, 250)), p(0, 0))
    expect(finish(state, ctx())).toMatchObject({
      rect: { x: 100, y: 100, width: noteConfig.minWidth, height: noteConfig.minHeight },
    })
  })

  it('limits the right and bottom edge to the board', () => {
    const state = dragTo(startResizing(note, p(300, 250)), p(5000, 5000))
    expect(finish(state, ctx())).toMatchObject({
      rect: { x: 100, y: 100, width: 900, height: 700 },
    })
  })

  it('never goes below the minimum size, even next to the edge', () => {
    const near: Pick<Note, 'id' | 'rect'> = {
      id: noteId,
      rect: { x: 980, y: 790, width: 150, height: 100 },
    }
    const state = dragTo(startResizing(near, p(0, 0)), p(50, 50))
    expect(finish(state, ctx())).toMatchObject({
      rect: { x: 980, y: 790, width: noteConfig.minWidth, height: noteConfig.minHeight },
    })
  })

  it('a click on the handle does nothing', () => {
    const state = dragTo(startResizing(note, p(0, 0)), p(0, t - 1))
    expect(finish(state, ctx())).toBeNull()
  })

  it('ignores overTrash', () => {
    const state = dragTo(startResizing(note, p(0, 0)), p(50, 50), true)
    expect(finish(state, ctx({ overTrash: true }))?.type).toBe('noteResized')
  })
})

describe('snapStepFor', () => {
  it('is null when snapping is off, whatever Shift does', () => {
    expect(snapStepFor(false, false)).toBeNull()
    expect(snapStepFor(false, true)).toBeNull()
  })

  it('uses the fine step, and the coarse one with Shift', () => {
    expect(snapStepFor(true, false)).toBe(snapConfig.step)
    expect(snapStepFor(true, true)).toBe(snapConfig.shiftStep)
  })
})

describe('snapped move', () => {
  it('puts the top-left corner on the grid and keeps the size', () => {
    const state = dragTo(startMoving(note, p(0, 0)), p(23, 37), false, 10)
    expect(finish(state, ctx())).toEqual({
      type: 'noteMoved',
      id: noteId,
      rect: { x: 120, y: 140, width: 200, height: 150 },
    })
  })

  it('uses the coarser step', () => {
    const state = dragTo(startMoving(note, p(0, 0)), p(23, 37), false, 30)
    expect(finish(state, ctx())).toMatchObject({ rect: { x: 120, y: 150 } })
  })

  it('still clamps to the board edges after snapping', () => {
    const state = dragTo(startMoving(note, p(0, 0)), p(2000, -500), false, 30)
    expect(finish(state, ctx())).toMatchObject({ rect: { x: 800, y: 0 } })
  })

  it('does not snap when the step is null', () => {
    const state = dragTo(startMoving(note, p(0, 0)), p(23, 37), false, null)
    expect(finish(state, ctx())).toMatchObject({ rect: { x: 123, y: 137 } })
  })
})

describe('snapped resize', () => {
  it('puts the bottom-right corner on the grid', () => {
    const state = dragTo(startResizing(note, p(0, 0)), p(23, 37), false, 10)
    expect(finish(state, ctx())).toEqual({
      type: 'noteResized',
      id: noteId,
      rect: { x: 100, y: 100, width: 220, height: 190 },
    })
  })

  it('uses the coarser step', () => {
    const state = dragTo(startResizing(note, p(0, 0)), p(23, 37), false, 30)
    expect(finish(state, ctx())).toMatchObject({ rect: { width: 230, height: 200 } })
  })

  it('snaps the corner, not the size, for a note that is off the grid', () => {
    const offGrid: Pick<Note, 'id' | 'rect'> = {
      id: noteId,
      rect: { x: 105, y: 100, width: 200, height: 150 },
    }
    const state = dragTo(startResizing(offGrid, p(0, 0)), p(8, 0), false, 10)
    expect(finish(state, ctx())).toMatchObject({ rect: { x: 105, width: 205 } })
  })

  it('still enforces the minimum size and the board edge', () => {
    const small = dragTo(startResizing(note, p(300, 250)), p(0, 0), false, 30)
    expect(finish(small, ctx())).toMatchObject({
      rect: { width: noteConfig.minWidth, height: noteConfig.minHeight },
    })
    const large = dragTo(startResizing(note, p(0, 0)), p(5000, 5000), false, 30)
    expect(finish(large, ctx())).toMatchObject({ rect: { width: 900, height: 700 } })
  })

  it('does not snap when the step is null', () => {
    const state = dragTo(startResizing(note, p(0, 0)), p(23, 37), false, null)
    expect(finish(state, ctx())).toMatchObject({ rect: { width: 223, height: 187 } })
  })
})

describe('finish', () => {
  it('returns null when idle', () => {
    expect(finish(idleDrag, ctx())).toBeNull()
  })

  it('does not call newNoteId for move, resize or idle', () => {
    const newNoteId = vi.fn(() => newId)
    finish(idleDrag, ctx({ newNoteId }))
    finish(dragTo(startMoving(note, p(0, 0)), p(80, 80)), ctx({ newNoteId }))
    finish(dragTo(startMoving(note, p(0, 0)), p(80, 80), true), ctx({ newNoteId, overTrash: true }))
    finish(dragTo(startResizing(note, p(0, 0)), p(80, 80)), ctx({ newNoteId }))
    expect(newNoteId).not.toHaveBeenCalled()
  })
})

describe('previewRect', () => {
  it('is null when idle', () => {
    expect(previewRect(idleDrag, board)).toBeNull()
  })

  it('is null below the threshold for every gesture', () => {
    const small = p(t - 1, 0)
    expect(previewRect(dragTo(startCreating(p(0, 0)), small), board)).toBeNull()
    expect(previewRect(dragTo(startMoving(note, p(0, 0)), small), board)).toBeNull()
    expect(previewRect(dragTo(startResizing(note, p(0, 0)), small), board)).toBeNull()
  })

  const cases: readonly (readonly [string, DragState])[] = [
    ['create', dragTo(startCreating(p(400, 400)), p(250, 300))],
    ['create, tiny', dragTo(startCreating(p(100, 100)), p(100 + t, 100))],
    ['create, past edge', dragTo(startCreating(p(990, 790)), p(1200, 900))],
    ['move', dragTo(startMoving(note, p(0, 0)), p(70, -30))],
    ['move, past edge', dragTo(startMoving(note, p(0, 0)), p(-900, 4000))],
    ['resize', dragTo(startResizing(note, p(0, 0)), p(60, 40))],
    ['resize, tiny', dragTo(startResizing(note, p(0, 0)), p(-400, -400))],
    ['resize, past edge', dragTo(startResizing(note, p(0, 0)), p(4000, 4000))],
    ['move, snapped to 10', dragTo(startMoving(note, p(0, 0)), p(23, 37), false, 10)],
    ['move, snapped to 30', dragTo(startMoving(note, p(0, 0)), p(23, 37), false, 30)],
    ['resize, snapped to 10', dragTo(startResizing(note, p(0, 0)), p(23, 37), false, 10)],
    ['resize, snapped to 30, tiny', dragTo(startResizing(note, p(0, 0)), p(-400, -400), false, 30)],
  ]

  it.each(cases)('equals the rect finish commits: %s', (_name, state) => {
    const action = finish(state, ctx())
    const committed: Rect | undefined = action?.rect
    expect(committed).toBeDefined()
    expect(previewRect(state, board)).toEqual(committed)
  })
})
