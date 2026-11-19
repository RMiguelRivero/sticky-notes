import { describe, expect, it } from 'vitest'
import { type Board, createEmptyBoard, createNoteId, type Note, type NoteId } from './board.ts'
import { compactZ } from './compactZ.ts'
import { noteConfig } from './config.ts'

const rect = { x: 10, y: 20, width: noteConfig.defaultWidth, height: noteConfig.defaultHeight }

function note(id: NoteId, z: number): Note {
  return { id, rect, text: '', color: noteConfig.defaultColor, z }
}

function boardOf(...notes: Note[]): Board {
  return { title: 'Board', notes }
}

const a = createNoteId()
const b = createNoteId()
const c = createNoteId()

describe('compactZ', () => {
  it('renumbers z to 1..n in the same stacking order and keeps array order', () => {
    const next = compactZ(boardOf(note(a, 50), note(b, 7), note(c, 20)))
    expect(next.notes.map((n) => [n.id, n.z])).toEqual([
      [a, 3],
      [b, 1],
      [c, 2],
    ])
  })

  it('breaks ties by array order', () => {
    const next = compactZ(boardOf(note(a, 5), note(b, 5), note(c, 1)))
    expect(next.notes.map((n) => [n.id, n.z])).toEqual([
      [a, 2],
      [b, 3],
      [c, 1],
    ])
  })

  it('keeps the title and handles an empty board', () => {
    const next = compactZ({ ...createEmptyBoard(), title: 'Loaded' })
    expect(next.title).toBe('Loaded')
    expect(next.notes).toEqual([])
  })

  it('never mutates the input', () => {
    const board = boardOf(note(a, 9), note(b, 4))
    const snapshot = structuredClone(board)
    compactZ(board)
    expect(board).toEqual(snapshot)
  })
})
