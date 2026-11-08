import { z } from 'zod'
import type { Board } from '../domain/board.ts'
import { boardSchema } from '../domain/boardSchema.ts'
import { persistenceConfig } from '../domain/config.ts'

export type StoredBoard = {
  readonly version: typeof persistenceConfig.schemaVersion
  readonly board: Board
}

export const storedBoardSchema = z
  .object({
    version: z.literal(persistenceConfig.schemaVersion),
    board: boardSchema,
  })
  .readonly() satisfies z.ZodType<StoredBoard>

export function toStoredBoard(board: Board): StoredBoard {
  return { version: persistenceConfig.schemaVersion, board }
}

export function parseStoredBoardJson(raw: string): Board | null {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  const parsed = storedBoardSchema.safeParse(data)
  return parsed.success ? parsed.data.board : null
}
