import { describe, expect, it } from 'vitest'
import { createNoteId, isNoteId } from './board.ts'
import { boardSchema, noteIdSchema, noteSchema } from './boardSchema.ts'
import { boardConfig, noteConfig } from './config.ts'

function validNote(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: createNoteId(),
    rect: { x: 0, y: 0, width: noteConfig.defaultWidth, height: noteConfig.defaultHeight },
    text: 'hello',
    color: noteConfig.defaultColor,
    z: 1,
    ...overrides,
  }
}

function withRect(overrides: Record<string, unknown>): Record<string, unknown> {
  return validNote({
    rect: { x: 0, y: 0, width: noteConfig.minWidth, height: noteConfig.minHeight, ...overrides },
  })
}

describe('NoteId', () => {
  it('createNoteId passes the guard', () => {
    expect(isNoteId(createNoteId())).toBe(true)
  })

  it('rejects non-UUID strings', () => {
    expect(isNoteId('abc')).toBe(false)
    expect(isNoteId('')).toBe(false)
  })
})

describe('noteIdSchema', () => {
  it('accepts a UUID and rejects other values', () => {
    expect(noteIdSchema.safeParse(createNoteId()).success).toBe(true)
    expect(noteIdSchema.safeParse('not-an-id').success).toBe(false)
    expect(noteIdSchema.safeParse(42).success).toBe(false)
  })
})

describe('noteSchema', () => {
  it('accepts a valid note and returns it typed', () => {
    const input = validNote()
    const result = noteSchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.text).toBe('hello')
      expect(result.data.rect.width).toBe(noteConfig.defaultWidth)
    }
  })

  it('accepts exact minimum size and maximum text', () => {
    expect(noteSchema.safeParse(withRect({})).success).toBe(true)
    expect(
      noteSchema.safeParse(validNote({ text: 'a'.repeat(noteConfig.maxTextLength) })).success,
    ).toBe(true)
  })

  it.each([
    ['wrong id', validNote({ id: 'nope' })],
    ['width too small', withRect({ width: noteConfig.minWidth - 1 })],
    ['height too small', withRect({ height: noteConfig.minHeight - 1 })],
    ['text too long', validNote({ text: 'a'.repeat(noteConfig.maxTextLength + 1) })],
    ['unknown color', validNote({ color: 'green' })],
    ['z zero', validNote({ z: 0 })],
    ['z negative', validNote({ z: -1 })],
    ['z fractional', validNote({ z: 1.5 })],
    ['NaN coordinate', withRect({ x: Number.NaN })],
    ['infinite coordinate', withRect({ y: Number.POSITIVE_INFINITY })],
    ['NaN width', withRect({ width: Number.NaN })],
    ['missing field', { ...validNote(), text: undefined }],
    ['extra nesting', validNote({ rect: { rect: { x: 0, y: 0, width: 200, height: 200 } } })],
    ['not an object', 'note'],
  ])('rejects %s', (_name, input) => {
    expect(noteSchema.safeParse(input).success).toBe(false)
  })
})

describe('boardSchema', () => {
  it('accepts a valid board and returns it typed', () => {
    const result = boardSchema.safeParse({
      title: 'Plan',
      notes: [validNote(), validNote({ z: 2 })],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.title).toBe('Plan')
      expect(result.data.notes).toHaveLength(2)
    }
  })

  it('accepts an empty title, empty notes and a title at the limit', () => {
    expect(boardSchema.safeParse({ title: '', notes: [] }).success).toBe(true)
    const title = 'a'.repeat(boardConfig.maxTitleLength)
    expect(boardSchema.safeParse({ title, notes: [] }).success).toBe(true)
  })

  it('rejects a title that is too long', () => {
    const title = 'a'.repeat(boardConfig.maxTitleLength + 1)
    expect(boardSchema.safeParse({ title, notes: [] }).success).toBe(false)
  })

  it('rejects duplicate note ids', () => {
    const id = createNoteId()
    const result = boardSchema.safeParse({
      title: 'x',
      notes: [validNote({ id }), validNote({ id, z: 2 })],
    })
    expect(result.success).toBe(false)
  })

  it('rejects an invalid note inside the board', () => {
    expect(
      boardSchema.safeParse({ title: 'x', notes: [validNote({ color: 'red' })] }).success,
    ).toBe(false)
  })

  it.each([
    ['missing title', { notes: [] }],
    ['missing notes', { title: 'x' }],
    ['notes not an array', { title: 'x', notes: {} }],
    ['extra nesting', { board: { title: 'x', notes: [] } }],
    ['null', null],
  ])('rejects %s', (_name, input) => {
    expect(boardSchema.safeParse(input).success).toBe(false)
  })
})
