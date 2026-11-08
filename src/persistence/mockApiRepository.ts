import { type Board, createEmptyBoard, type Note } from '../domain/board.ts'
import {
  type BoardRepository,
  describeError,
  type LoadResult,
  type SaveResult,
} from './BoardRepository.ts'
import type { MockResponse, MockServer } from './mockServer.ts'
import { storedBoardSchema } from './storedBoard.ts'

type Operation = {
  readonly send: () => Promise<MockResponse>
  // How the confirmed board looks once the server has accepted this request.
  readonly applyTo: (confirmed: Board) => Board
  // A note that is already gone is the outcome a delete wanted.
  readonly acceptsNotFound: boolean
}

function notesEqual(a: Note, b: Note): boolean {
  return (
    a.rect.x === b.rect.x &&
    a.rect.y === b.rect.y &&
    a.rect.width === b.rect.width &&
    a.rect.height === b.rect.height &&
    a.text === b.text &&
    a.color === b.color &&
    a.z === b.z
  )
}

function upsertNote(board: Board, note: Note): Board {
  const exists = board.notes.some((n) => n.id === note.id)
  return {
    ...board,
    notes: exists ? board.notes.map((n) => (n.id === note.id ? note : n)) : [...board.notes, note],
  }
}

function diff(server: MockServer, confirmed: Board, board: Board): readonly Operation[] {
  const operations: Operation[] = []

  if (board.title !== confirmed.title) {
    const { title } = board
    operations.push({
      send: () => server.request('PATCH', '/board', { title }),
      applyTo: (c) => ({ ...c, title }),
      acceptsNotFound: false,
    })
  }

  const confirmedById = new Map(confirmed.notes.map((note) => [note.id, note]))
  for (const note of board.notes) {
    const before = confirmedById.get(note.id)
    if (before === undefined) {
      operations.push({
        send: () => server.request('POST', '/notes', note),
        applyTo: (c) => upsertNote(c, note),
        acceptsNotFound: false,
      })
    } else if (!notesEqual(before, note)) {
      operations.push({
        send: () => server.request('PATCH', `/notes/${note.id}`, note),
        applyTo: (c) => upsertNote(c, note),
        acceptsNotFound: false,
      })
    }
  }

  const currentIds = new Set(board.notes.map((note) => note.id))
  for (const note of confirmed.notes) {
    if (!currentIds.has(note.id)) {
      operations.push({
        send: () => server.request('DELETE', `/notes/${note.id}`),
        applyTo: (c) => ({ ...c, notes: c.notes.filter((n) => n.id !== note.id) }),
        acceptsNotFound: true,
      })
    }
  }

  return operations
}

function isAccepted(operation: Operation, response: MockResponse): boolean {
  const ok = response.status >= 200 && response.status < 300
  return ok || (operation.acceptsNotFound && response.status === 404)
}

export function createMockApiRepository(server: MockServer): BoardRepository {
  // What the server has acknowledged so far. Each save sends only the difference to this.
  let confirmed: Board = createEmptyBoard()

  async function sendOperation(operation: Operation): Promise<boolean> {
    try {
      const response = await operation.send()
      if (!isAccepted(operation, response)) {
        return false
      }
      // Updated per request, so a partly failed save re-sends only what failed.
      confirmed = operation.applyTo(confirmed)
      return true
    } catch {
      return false
    }
  }

  return {
    async load(): Promise<LoadResult> {
      try {
        const response = await server.request('GET', '/board')
        if (response.status === 404) {
          confirmed = createEmptyBoard()
          return { kind: 'empty' }
        }
        if (response.status !== 200) {
          return { kind: 'failed', message: `Server responded with status ${response.status}` }
        }
        const parsed = storedBoardSchema.safeParse(response.body)
        if (!parsed.success) {
          return { kind: 'corrupt' }
        }
        confirmed = parsed.data.board
        return { kind: 'loaded', board: parsed.data.board }
      } catch (error) {
        return { kind: 'failed', message: describeError(error) }
      }
    },

    async save(board: Board): Promise<SaveResult> {
      const operations = diff(server, confirmed, board)
      const outcomes = await Promise.all(operations.map(sendOperation))
      const failures = outcomes.filter((ok) => !ok).length
      return failures === 0
        ? { kind: 'saved' }
        : { kind: 'failed', message: `${failures} of ${operations.length} requests failed` }
    },
  }
}
