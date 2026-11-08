import { describe, expect, it } from 'vitest'
import { type Board, createEmptyBoard, createNoteId, type Note, type NoteId } from './board.ts'
import { boardReducer } from './boardReducer.ts'
import { boardConfig, noteConfig } from './config.ts'

const rect = { x: 10, y: 20, width: noteConfig.defaultWidth, height: noteConfig.defaultHeight }

function note(id: NoteId, z: number, overrides: Partial<Note> = {}): Note {
  return { id, rect, text: '', color: noteConfig.defaultColor, z, ...overrides }
}

function boardOf(...notes: Note[]): Board {
  return { title: 'Board', notes }
}

function find(board: Board, id: NoteId): Note {
  const found = board.notes.find((n) => n.id === id)
  if (found === undefined) throw new Error('note not found')
  return found
}

const a = createNoteId()
const b = createNoteId()
const c = createNoteId()
const unknown = createNoteId()

describe('noteCreated', () => {
  it('adds a note with empty text, default color and z 1 on an empty board', () => {
    const next = boardReducer(createEmptyBoard(), { type: 'noteCreated', id: a, rect })
    expect(next.notes).toEqual([note(a, 1)])
  })

  it('uses the given color', () => {
    const next = boardReducer(createEmptyBoard(), {
      type: 'noteCreated',
      id: a,
      rect,
      color: 'pink',
    })
    expect(find(next, a).color).toBe('pink')
  })

  it('enforces the minimum size', () => {
    const tiny = { x: 5, y: 6, width: 1, height: 1 }
    const next = boardReducer(createEmptyBoard(), { type: 'noteCreated', id: a, rect: tiny })
    expect(find(next, a).rect).toEqual({
      x: 5,
      y: 6,
      width: noteConfig.minWidth,
      height: noteConfig.minHeight,
    })
  })

  it('puts the new note above the highest z', () => {
    const state = boardOf(note(a, 3), note(b, 7))
    const next = boardReducer(state, { type: 'noteCreated', id: c, rect })
    expect(find(next, c).z).toBe(8)
  })

  it('ignores an id that already exists', () => {
    const state = boardOf(note(a, 1))
    expect(boardReducer(state, { type: 'noteCreated', id: a, rect })).toBe(state)
  })
})

describe('noteMoved and noteResized', () => {
  const moved = { ...rect, x: 100, y: 200 }

  it('noteMoved sets the rect', () => {
    const next = boardReducer(boardOf(note(a, 1)), { type: 'noteMoved', id: a, rect: moved })
    expect(find(next, a).rect).toEqual(moved)
  })

  it('noteResized sets the rect', () => {
    const resized = { ...rect, width: rect.width + 50, height: rect.height + 30 }
    const next = boardReducer(boardOf(note(a, 1)), { type: 'noteResized', id: a, rect: resized })
    expect(find(next, a).rect).toEqual(resized)
  })

  it('enforces the minimum size on both actions', () => {
    const tiny = { x: 1, y: 2, width: 0, height: 0 }
    const min = { x: 1, y: 2, width: noteConfig.minWidth, height: noteConfig.minHeight }
    for (const type of ['noteMoved', 'noteResized'] as const) {
      const next = boardReducer(boardOf(note(a, 1)), { type, id: a, rect: tiny })
      expect(find(next, a).rect).toEqual(min)
    }
  })

  it('returns the same state for an unknown id', () => {
    const state = boardOf(note(a, 1))
    expect(boardReducer(state, { type: 'noteMoved', id: unknown, rect: moved })).toBe(state)
    expect(boardReducer(state, { type: 'noteResized', id: unknown, rect: moved })).toBe(state)
  })

  it('returns the same state for an unchanged rect', () => {
    const state = boardOf(note(a, 1))
    expect(boardReducer(state, { type: 'noteMoved', id: a, rect: { ...rect } })).toBe(state)
    expect(boardReducer(state, { type: 'noteResized', id: a, rect: { ...rect } })).toBe(state)
  })

  it('returns the same state when a too-small rect clamps to the current rect', () => {
    const min = { x: 0, y: 0, width: noteConfig.minWidth, height: noteConfig.minHeight }
    const state = boardOf(note(a, 1, { rect: min }))
    const tiny = { x: 0, y: 0, width: 1, height: 1 }
    expect(boardReducer(state, { type: 'noteMoved', id: a, rect: tiny })).toBe(state)
  })

  it('keeps other notes untouched', () => {
    const state = boardOf(note(a, 1), note(b, 2))
    const next = boardReducer(state, { type: 'noteMoved', id: a, rect: moved })
    expect(find(next, b)).toBe(find(state, b))
  })
})

describe('noteDeleted', () => {
  it('removes the note', () => {
    const next = boardReducer(boardOf(note(a, 1), note(b, 2)), { type: 'noteDeleted', id: a })
    expect(next.notes.map((n) => n.id)).toEqual([b])
  })

  it('returns the same state for an unknown id', () => {
    const state = boardOf(note(a, 1))
    expect(boardReducer(state, { type: 'noteDeleted', id: unknown })).toBe(state)
  })
})

describe('noteBroughtToFront', () => {
  it('sets z to max + 1 without reordering the array', () => {
    const state = boardOf(note(a, 1), note(b, 2), note(c, 3))
    const next = boardReducer(state, { type: 'noteBroughtToFront', id: a })
    expect(find(next, a).z).toBe(4)
    expect(next.notes.map((n) => n.id)).toEqual([a, b, c])
  })

  it('returns the same state when already on top', () => {
    const state = boardOf(note(a, 1), note(b, 2))
    expect(boardReducer(state, { type: 'noteBroughtToFront', id: b })).toBe(state)
  })

  it('returns the same state for an unknown id', () => {
    const state = boardOf(note(a, 1))
    expect(boardReducer(state, { type: 'noteBroughtToFront', id: unknown })).toBe(state)
  })
})

describe('noteTextChanged', () => {
  it('sets the text', () => {
    const next = boardReducer(boardOf(note(a, 1)), { type: 'noteTextChanged', id: a, text: 'hi' })
    expect(find(next, a).text).toBe('hi')
  })

  it('cuts the text to the maximum length', () => {
    const text = 'x'.repeat(noteConfig.maxTextLength + 10)
    const next = boardReducer(boardOf(note(a, 1)), { type: 'noteTextChanged', id: a, text })
    expect(find(next, a).text).toBe('x'.repeat(noteConfig.maxTextLength))
  })

  it('returns the same state for same text or unknown id', () => {
    const state = boardOf(note(a, 1, { text: 'same' }))
    expect(boardReducer(state, { type: 'noteTextChanged', id: a, text: 'same' })).toBe(state)
    expect(boardReducer(state, { type: 'noteTextChanged', id: unknown, text: 'x' })).toBe(state)
  })

  it('returns the same state when cutting makes the text equal to the current one', () => {
    const full = 'x'.repeat(noteConfig.maxTextLength)
    const state = boardOf(note(a, 1, { text: full }))
    expect(boardReducer(state, { type: 'noteTextChanged', id: a, text: `${full}more` })).toBe(state)
  })
})

describe('noteColorChanged', () => {
  it('sets the color', () => {
    const next = boardReducer(boardOf(note(a, 1)), {
      type: 'noteColorChanged',
      id: a,
      color: 'blue',
    })
    expect(find(next, a).color).toBe('blue')
  })

  it('returns the same state for same color or unknown id', () => {
    const state = boardOf(note(a, 1, { color: 'blue' }))
    expect(boardReducer(state, { type: 'noteColorChanged', id: a, color: 'blue' })).toBe(state)
    expect(boardReducer(state, { type: 'noteColorChanged', id: unknown, color: 'pink' })).toBe(
      state,
    )
  })
})

describe('titleChanged', () => {
  it('sets the title without trimming', () => {
    const next = boardReducer(boardOf(), { type: 'titleChanged', title: ' New ' })
    expect(next.title).toBe(' New ')
  })

  it('cuts the title to the maximum length', () => {
    const title = 'x'.repeat(boardConfig.maxTitleLength + 5)
    const next = boardReducer(boardOf(), { type: 'titleChanged', title })
    expect(next.title).toBe('x'.repeat(boardConfig.maxTitleLength))
  })

  it('returns the same state for the same title', () => {
    const state = boardOf()
    expect(boardReducer(state, { type: 'titleChanged', title: state.title })).toBe(state)
  })
})

describe('boardLoaded', () => {
  it('replaces the state and compacts z to 1..n in the same stacking order', () => {
    const loaded = { title: 'Loaded', notes: [note(a, 50), note(b, 7), note(c, 20)] }
    const next = boardReducer(boardOf(note(unknown, 1)), { type: 'boardLoaded', board: loaded })
    expect(next.title).toBe('Loaded')
    expect(next.notes.map((n) => [n.id, n.z])).toEqual([
      [a, 3],
      [b, 1],
      [c, 2],
    ])
  })

  it('loads an empty board', () => {
    const next = boardReducer(boardOf(note(a, 1)), {
      type: 'boardLoaded',
      board: createEmptyBoard(),
    })
    expect(next.notes).toEqual([])
  })
})

describe('immutability', () => {
  it('never mutates the input state', () => {
    const state = boardOf(note(a, 1), note(b, 2))
    const snapshot = structuredClone(state)
    boardReducer(state, { type: 'noteCreated', id: c, rect })
    boardReducer(state, { type: 'noteMoved', id: a, rect: { ...rect, x: 999 } })
    boardReducer(state, { type: 'noteResized', id: a, rect: { ...rect, width: 999 } })
    boardReducer(state, { type: 'noteBroughtToFront', id: a })
    boardReducer(state, { type: 'noteTextChanged', id: a, text: 'x' })
    boardReducer(state, { type: 'noteColorChanged', id: a, color: 'pink' })
    boardReducer(state, { type: 'noteDeleted', id: a })
    boardReducer(state, { type: 'titleChanged', title: 'other' })
    boardReducer(state, { type: 'boardLoaded', board: state })
    expect(state).toEqual(snapshot)
  })
})
