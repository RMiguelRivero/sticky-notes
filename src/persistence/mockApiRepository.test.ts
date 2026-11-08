import { describe, expect, it } from 'vitest'
import { type Board, createNoteId, type Note } from '../domain/board.ts'
import { noteConfig, persistenceConfig } from '../domain/config.ts'
import type { KeyValueStorage } from './BoardRepository.ts'
import { createMockApiRepository } from './mockApiRepository.ts'
import {
  createMockServer,
  type HttpMethod,
  type MockResponse,
  type MockServer,
} from './mockServer.ts'
import { toStoredBoard } from './storedBoard.ts'

function createMemoryStorage(): KeyValueStorage {
  const data = new Map<string, string>()
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
    removeItem: (key) => {
      data.delete(key)
    },
  }
}

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: createNoteId(),
    rect: { x: 0, y: 0, width: noteConfig.defaultWidth, height: noteConfig.defaultHeight },
    text: '',
    color: noteConfig.defaultColor,
    z: 1,
    ...overrides,
  }
}

type RecordedRequest = { readonly method: HttpMethod; readonly path: string }

// Wraps a real mock server: records every request and can fail chosen ones.
function setup(shouldFail: (request: RecordedRequest) => boolean = () => false) {
  const storage = createMemoryStorage()
  const real = createMockServer({
    storage,
    latencyMs: persistenceConfig.mockLatencyMs,
    failureRate: 0,
    random: () => 0.5,
    delay: async () => {},
  })
  const requests: RecordedRequest[] = []
  const server: MockServer = {
    async request(method, path, body): Promise<MockResponse> {
      requests.push({ method, path })
      if (shouldFail({ method, path })) {
        return { status: 503, body: null }
      }
      return real.request(method, path, body)
    },
  }
  return { repository: createMockApiRepository(server), requests, storage }
}

const empty: Board = { title: 'Board', notes: [] }

describe('mock API repository', () => {
  it('loads empty from a new server', async () => {
    const { repository } = setup()
    expect(await repository.load()).toEqual({ kind: 'empty' })
  })

  it('saves a new board and loads it back', async () => {
    const { repository } = setup()
    await repository.load()
    const board: Board = { title: 'Plans', notes: [makeNote({ text: 'a' }), makeNote({ z: 2 })] }
    expect(await repository.save(board)).toEqual({ kind: 'saved' })
    expect(await repository.load()).toEqual({ kind: 'loaded', board })
  })

  it('sends one POST per new note and one PATCH for a changed title', async () => {
    const { repository, requests } = setup()
    await repository.load()
    const a = makeNote()
    const b = makeNote()
    await repository.save({ title: 'Plans', notes: [a, b] })
    expect(requests.slice(1)).toEqual([
      { method: 'PATCH', path: '/board' },
      { method: 'POST', path: '/notes' },
      { method: 'POST', path: '/notes' },
    ])
  })

  it('sends only the changes on later saves', async () => {
    const { repository, requests } = setup()
    await repository.load()
    const a = makeNote()
    const b = makeNote()
    const first: Board = { ...empty, notes: [a, b] }
    await repository.save(first)
    requests.length = 0

    expect(await repository.save(first)).toEqual({ kind: 'saved' })
    expect(requests).toEqual([])

    const movedA = { ...a, rect: { ...a.rect, x: 50 } }
    await repository.save({ ...empty, notes: [movedA, b] })
    expect(requests).toEqual([{ method: 'PATCH', path: `/notes/${a.id}` }])
  })

  it('treats a changed z as a change', async () => {
    const { repository, requests } = setup()
    await repository.load()
    const a = makeNote()
    await repository.save({ ...empty, notes: [a] })
    requests.length = 0
    await repository.save({ ...empty, notes: [{ ...a, z: 5 }] })
    expect(requests).toEqual([{ method: 'PATCH', path: `/notes/${a.id}` }])
  })

  it('sends DELETE for a removed note', async () => {
    const { repository, requests } = setup()
    await repository.load()
    const a = makeNote()
    await repository.save({ ...empty, notes: [a] })
    requests.length = 0
    expect(await repository.save(empty)).toEqual({ kind: 'saved' })
    expect(requests).toEqual([{ method: 'DELETE', path: `/notes/${a.id}` }])
  })

  it('accepts 404 on DELETE when the note is already gone on the server', async () => {
    const a = makeNote()
    const { repository, storage } = setup()
    await repository.load()
    await repository.save({ ...empty, notes: [a] })
    storage.setItem(
      persistenceConfig.mockServerKey,
      JSON.stringify(toStoredBoard({ ...empty, notes: [] })),
    )
    expect(await repository.save(empty)).toEqual({ kind: 'saved' })
    expect(await repository.save(empty)).toEqual({ kind: 'saved' })
  })

  it('reports how many requests failed and re-sends only those next time', async () => {
    const a = makeNote()
    const b = makeNote()
    const c = makeNote()
    let failSecondPost = true
    let posts = 0
    const { repository, requests } = setup(({ method }) => {
      if (method !== 'POST') {
        return false
      }
      posts += 1
      return failSecondPost && posts === 2
    })
    await repository.load()
    // One PATCH for the title and three POSTs; the second POST fails.
    const board: Board = { title: 'Plans', notes: [a, b, c] }
    const result = await repository.save(board)
    expect(result).toEqual({ kind: 'failed', message: '1 of 4 requests failed' })

    failSecondPost = false
    requests.length = 0
    expect(await repository.save(board)).toEqual({ kind: 'saved' })
    expect(requests).toEqual([{ method: 'POST', path: '/notes' }])
    expect(await repository.load()).toMatchObject({ kind: 'loaded' })
  })

  it('keeps a failed title change unconfirmed and re-sends it', async () => {
    let failing = true
    const { repository, requests } = setup(() => failing)
    await repository.load()
    const board: Board = { title: 'New title', notes: [] }
    expect(await repository.save(board)).toEqual({
      kind: 'failed',
      message: '1 of 1 requests failed',
    })
    failing = false
    requests.length = 0
    expect(await repository.save(board)).toEqual({ kind: 'saved' })
    expect(requests).toEqual([{ method: 'PATCH', path: '/board' }])
  })

  it('turns a server error on load into failed', async () => {
    const { repository } = setup(() => true)
    expect(await repository.load()).toEqual({
      kind: 'failed',
      message: 'Server responded with status 503',
    })
  })

  it('turns a thrown request into a failed save', async () => {
    const server: MockServer = {
      request: async (): Promise<MockResponse> => {
        throw new Error('network down')
      },
    }
    const repository = createMockApiRepository(server)
    expect(await repository.load()).toEqual({ kind: 'failed', message: 'network down' })
    expect(await repository.save({ title: 'x', notes: [] })).toEqual({
      kind: 'failed',
      message: '1 of 1 requests failed',
    })
  })

  it('reports a response that fails validation as corrupt', async () => {
    const server: MockServer = {
      request: async (): Promise<MockResponse> => ({ status: 200, body: { version: 1 } }),
    }
    expect(await createMockApiRepository(server).load()).toEqual({ kind: 'corrupt' })
  })
})
