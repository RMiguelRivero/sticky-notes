import { describe, expect, it } from 'vitest'
import { type Board, createNoteId } from '../domain/board.ts'
import { noteConfig, persistenceConfig } from '../domain/config.ts'
import { parseStoredBoardJson, storedBoardSchema, toStoredBoard } from './storedBoard.ts'

const board: Board = {
  title: 'Plans',
  notes: [
    {
      id: createNoteId(),
      rect: { x: 1, y: 2, width: noteConfig.defaultWidth, height: noteConfig.defaultHeight },
      text: 'hi',
      color: noteConfig.defaultColor,
      z: 1,
    },
  ],
}

describe('storedBoardSchema', () => {
  it('accepts a versioned board', () => {
    expect(storedBoardSchema.safeParse(toStoredBoard(board)).success).toBe(true)
  })

  it('rejects another version', () => {
    const wrong = { version: persistenceConfig.schemaVersion + 1, board }
    expect(storedBoardSchema.safeParse(wrong).success).toBe(false)
  })

  it('rejects a bare board without the envelope', () => {
    expect(storedBoardSchema.safeParse(board).success).toBe(false)
  })

  it('rejects an invalid board inside the envelope', () => {
    const wrong = { version: persistenceConfig.schemaVersion, board: { title: 1, notes: [] } }
    expect(storedBoardSchema.safeParse(wrong).success).toBe(false)
  })
})

describe('parseStoredBoardJson', () => {
  it('returns the board for valid JSON', () => {
    expect(parseStoredBoardJson(JSON.stringify(toStoredBoard(board)))).toEqual(board)
  })

  it('returns null for text that is not JSON', () => {
    expect(parseStoredBoardJson('{oops')).toBeNull()
  })

  it('returns null for JSON that fails validation', () => {
    expect(parseStoredBoardJson('{"version":1}')).toBeNull()
  })
})
