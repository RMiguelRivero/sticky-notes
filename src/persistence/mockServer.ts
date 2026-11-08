import { z } from 'zod'
import { type Board, createEmptyBoard, isNoteId } from '../domain/board.ts'
import { noteSchema } from '../domain/boardSchema.ts'
import { boardConfig, persistenceConfig } from '../domain/config.ts'
import { assertNever } from '../utils/assertNever.ts'
import type { XOR } from '../utils/types/xor.ts'
import { describeError, type KeyValueStorage } from './BoardRepository.ts'
import { parseStoredBoardJson, toStoredBoard } from './storedBoard.ts'

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

export type MockResponse = { readonly status: number; readonly body: unknown }

export type MockServer = {
  readonly request: (method: HttpMethod, path: string, body?: unknown) => Promise<MockResponse>
}

export type MockServerOptions = {
  // The server's own storage, kept apart from the localStorage repository's key.
  readonly storage: KeyValueStorage
  readonly latencyMs: { readonly min: number; readonly max: number }
  readonly failureRate: number
  // Injected so tests are deterministic.
  readonly random: () => number
  readonly delay: (ms: number) => Promise<void>
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const titleBodySchema = z.object({ title: z.string().max(boardConfig.maxTitleLength) })

function respond(status: number, body: unknown = null): MockResponse {
  return { status, body }
}

function errorResponse(status: number, error: string): MockResponse {
  return respond(status, { error })
}

// Bodies cross the "network" as JSON, so nothing is shared by reference with the caller.
function throughWire(value: unknown): unknown {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

type MissingRead = { readonly kind: 'missing' }
type CorruptRead = { readonly kind: 'corrupt' }
type FoundRead = { readonly kind: 'found'; readonly board: Board }

type BoardRead = XOR<MissingRead, CorruptRead, FoundRead>

function readBoard(storage: KeyValueStorage): BoardRead {
  const raw = storage.getItem(persistenceConfig.mockServerKey)
  if (raw === null) {
    return { kind: 'missing' }
  }
  const board = parseStoredBoardJson(raw)
  return board === null ? { kind: 'corrupt' } : { kind: 'found', board }
}

function writeBoard(storage: KeyValueStorage, board: Board): void {
  storage.setItem(persistenceConfig.mockServerKey, JSON.stringify(toStoredBoard(board)))
}

// Writes need a board; the first write creates it.
function updateBoard(
  storage: KeyValueStorage,
  update: (
    board: Board,
  ) => { readonly board: Board; readonly response: MockResponse } | MockResponse,
): MockResponse {
  const read = readBoard(storage)
  if (read.kind === 'corrupt') {
    return errorResponse(500, 'Stored data is corrupt')
  }
  const current = read.kind === 'found' ? read.board : createEmptyBoard()
  const outcome = update(current)
  if (!('board' in outcome)) {
    return outcome
  }
  writeBoard(storage, outcome.board)
  return outcome.response
}

function patchBoard(storage: KeyValueStorage, body: unknown): MockResponse {
  const parsed = titleBodySchema.safeParse(body)
  if (!parsed.success) {
    return errorResponse(400, 'Invalid board body')
  }
  const { title } = parsed.data
  return updateBoard(storage, (board) => ({
    board: { ...board, title },
    response: respond(200, { title }),
  }))
}

function createNote(storage: KeyValueStorage, body: unknown): MockResponse {
  const parsed = noteSchema.safeParse(body)
  if (!parsed.success) {
    return errorResponse(400, 'Invalid note body')
  }
  const note = parsed.data
  return updateBoard(storage, (board) => {
    if (board.notes.some((n) => n.id === note.id)) {
      return errorResponse(409, 'Note already exists')
    }
    return { board: { ...board, notes: [...board.notes, note] }, response: respond(201, note) }
  })
}

function replaceNote(storage: KeyValueStorage, id: string, body: unknown): MockResponse {
  const parsed = noteSchema.safeParse(body)
  if (!parsed.success || parsed.data.id !== id) {
    return errorResponse(400, 'Invalid note body')
  }
  const note = parsed.data
  return updateBoard(storage, (board) => {
    if (!board.notes.some((n) => n.id === id)) {
      return errorResponse(404, 'Note not found')
    }
    return {
      board: { ...board, notes: board.notes.map((n) => (n.id === id ? note : n)) },
      response: respond(200, note),
    }
  })
}

function deleteNote(storage: KeyValueStorage, id: string): MockResponse {
  return updateBoard(storage, (board) => {
    if (!board.notes.some((n) => n.id === id)) {
      return errorResponse(404, 'Note not found')
    }
    return {
      board: { ...board, notes: board.notes.filter((n) => n.id !== id) },
      response: respond(204),
    }
  })
}

function getBoard(storage: KeyValueStorage): MockResponse {
  const read = readBoard(storage)
  switch (read.kind) {
    case 'missing':
      return errorResponse(404, 'No board yet')
    case 'corrupt':
      return errorResponse(500, 'Stored data is corrupt')
    case 'found':
      return respond(200, toStoredBoard(read.board))
    default:
      return assertNever(read)
  }
}

function handle(
  storage: KeyValueStorage,
  method: HttpMethod,
  path: string,
  body: unknown,
): MockResponse {
  const [resource, id, ...extra] = path.split('/').filter((part) => part !== '')
  if (extra.length > 0) {
    return errorResponse(404, 'Unknown route')
  }

  if (resource === 'board' && id === undefined) {
    switch (method) {
      case 'GET':
        return getBoard(storage)
      case 'PATCH':
        return patchBoard(storage, body)
      case 'POST':
      case 'DELETE':
        return errorResponse(405, 'Method not allowed')
      default:
        return assertNever(method)
    }
  }

  if (resource === 'notes' && id === undefined) {
    return method === 'POST' ? createNote(storage, body) : errorResponse(405, 'Method not allowed')
  }

  if (resource === 'notes' && id !== undefined) {
    if (!isNoteId(id)) {
      return errorResponse(404, 'Note not found')
    }
    switch (method) {
      case 'PATCH':
        return replaceNote(storage, id, body)
      case 'DELETE':
        return deleteNote(storage, id)
      case 'GET':
      case 'POST':
        return errorResponse(405, 'Method not allowed')
      default:
        return assertNever(method)
    }
  }

  return errorResponse(404, 'Unknown route')
}

export function createMockServer({
  storage,
  latencyMs,
  failureRate,
  random,
  delay,
}: MockServerOptions): MockServer {
  return {
    async request(method, path, body) {
      const requestBody = throughWire(body)
      await delay(latencyMs.min + random() * (latencyMs.max - latencyMs.min))

      let response: MockResponse
      if (random() < failureRate) {
        response = errorResponse(503, 'Service unavailable')
      } else {
        try {
          response = handle(storage, method, path, requestBody)
        } catch (error) {
          response = errorResponse(500, describeError(error))
        }
      }
      return { status: response.status, body: throughWire(response.body) }
    },
  }
}
