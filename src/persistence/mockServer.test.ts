import { describe, expect, it } from 'vitest'
import { createNoteId, type Note } from '../domain/board.ts'
import { boardConfig, noteConfig, persistenceConfig } from '../domain/config.ts'
import type { KeyValueStorage } from './BoardRepository.ts'
import { createMockServer, type MockServer } from './mockServer.ts'

function createMemoryStorage(): KeyValueStorage & { readonly data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
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

function setup(options: { failureRate?: number; random?: () => number } = {}) {
  const storage = createMemoryStorage()
  const delays: number[] = []
  const server: MockServer = createMockServer({
    storage,
    latencyMs: persistenceConfig.mockLatencyMs,
    failureRate: options.failureRate ?? 0,
    random: options.random ?? (() => 0.5),
    delay: async (ms) => {
      delays.push(ms)
    },
  })
  return { server, storage, delays }
}

describe('mock server', () => {
  it('answers 404 for GET /board before anything is stored', async () => {
    const { server } = setup()
    expect((await server.request('GET', '/board')).status).toBe(404)
  })

  it('creates, updates and deletes notes, and returns them with GET /board', async () => {
    const { server } = setup()
    const note = makeNote()
    expect((await server.request('POST', '/notes', note)).status).toBe(201)

    const changed = { ...note, text: 'changed', z: 2 }
    expect((await server.request('PATCH', `/notes/${note.id}`, changed)).status).toBe(200)

    const got = await server.request('GET', '/board')
    expect(got.status).toBe(200)
    expect(got.body).toEqual({
      version: persistenceConfig.schemaVersion,
      board: { title: boardConfig.defaultTitle, notes: [changed] },
    })

    expect((await server.request('DELETE', `/notes/${note.id}`)).status).toBe(204)
    const after = await server.request('GET', '/board')
    expect(after.body).toEqual({
      version: persistenceConfig.schemaVersion,
      board: { title: boardConfig.defaultTitle, notes: [] },
    })
  })

  it('changes the title with PATCH /board', async () => {
    const { server } = setup()
    expect((await server.request('PATCH', '/board', { title: 'Plans' })).status).toBe(200)
    const got = await server.request('GET', '/board')
    expect(got.body).toMatchObject({ board: { title: 'Plans' } })
  })

  it('answers 404 for an unknown note', async () => {
    const { server } = setup()
    await server.request('PATCH', '/board', { title: 'x' })
    const note = makeNote()
    expect((await server.request('PATCH', `/notes/${note.id}`, note)).status).toBe(404)
    expect((await server.request('DELETE', `/notes/${note.id}`)).status).toBe(404)
    expect((await server.request('DELETE', '/notes/not-an-id')).status).toBe(404)
  })

  it('answers 400 for malformed bodies', async () => {
    const { server } = setup()
    const note = makeNote()
    expect((await server.request('POST', '/notes', { id: 'nope' })).status).toBe(400)
    expect((await server.request('PATCH', '/board', { title: 42 })).status).toBe(400)
    await server.request('POST', '/notes', note)
    expect((await server.request('PATCH', `/notes/${note.id}`, makeNote())).status).toBe(400)
  })

  it('answers 409 when creating a note twice', async () => {
    const { server } = setup()
    const note = makeNote()
    await server.request('POST', '/notes', note)
    expect((await server.request('POST', '/notes', note)).status).toBe(409)
  })

  it('answers 404 or 405 for unknown routes and methods', async () => {
    const { server } = setup()
    expect((await server.request('GET', '/nothing')).status).toBe(404)
    expect((await server.request('GET', '/notes/a/b')).status).toBe(404)
    expect((await server.request('DELETE', '/board')).status).toBe(405)
    expect((await server.request('GET', '/notes')).status).toBe(405)
  })

  it('answers 500 when its stored data is corrupt', async () => {
    const { server, storage } = setup()
    storage.setItem(persistenceConfig.mockServerKey, 'garbage')
    expect((await server.request('GET', '/board')).status).toBe(500)
    expect((await server.request('PATCH', '/board', { title: 'x' })).status).toBe(500)
  })

  it('keeps its data in its own storage key', async () => {
    const { server, storage } = setup()
    await server.request('PATCH', '/board', { title: 'x' })
    expect([...storage.data.keys()]).toEqual([persistenceConfig.mockServerKey])
  })

  it('does not share objects with the caller', async () => {
    const { server } = setup()
    const note = makeNote()
    await server.request('POST', '/notes', note)
    const first = await server.request('GET', '/board')
    const second = await server.request('GET', '/board')
    expect(first.body).toEqual(second.body)
    expect(first.body).not.toBe(second.body)
  })

  it('waits a latency between min and max', async () => {
    const low = setup({ random: () => 0 })
    await low.server.request('GET', '/board')
    expect(low.delays).toEqual([persistenceConfig.mockLatencyMs.min])

    const high = setup({ random: () => 0.999999 })
    await high.server.request('GET', '/board')
    const [ms] = high.delays
    expect(ms).toBeGreaterThan(persistenceConfig.mockLatencyMs.min)
    expect(ms).toBeLessThanOrEqual(persistenceConfig.mockLatencyMs.max)
  })

  it('fails with 503 at the failure rate and changes nothing', async () => {
    const failing = setup({ failureRate: 0.3, random: () => 0.2 })
    const response = await failing.server.request('PATCH', '/board', { title: 'x' })
    expect(response.status).toBe(503)
    expect(failing.storage.data.size).toBe(0)

    const working = setup({ failureRate: 0.3, random: () => 0.4 })
    expect((await working.server.request('PATCH', '/board', { title: 'x' })).status).toBe(200)
  })

  it('never fails at rate 0 and always fails at rate 1', async () => {
    const never = setup({ failureRate: 0, random: () => 0 })
    expect((await never.server.request('GET', '/board')).status).toBe(404)
    const always = setup({ failureRate: 1, random: () => 0.999 })
    expect((await always.server.request('GET', '/board')).status).toBe(503)
  })
})
