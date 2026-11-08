import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Board } from '../domain/board.ts'
import { persistenceConfig } from '../domain/config.ts'
import type { KeyValueStorage } from './BoardRepository.ts'
import { parseRepositoryChoice, selectRepository } from './selectRepository.ts'

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

const board: Board = { title: 'Plans', notes: [] }

describe('parseRepositoryChoice', () => {
  it('uses localStorage by default', () => {
    expect(parseRepositoryChoice('')).toEqual({
      backend: 'local',
      failureRate: persistenceConfig.mockFailureRate,
    })
    expect(parseRepositoryChoice('?storage=other').backend).toBe('local')
  })

  it('picks the mock API with ?storage=api', () => {
    expect(parseRepositoryChoice('?storage=api').backend).toBe('api')
  })

  it('reads the failure rate and clamps it to 0..1', () => {
    expect(parseRepositoryChoice('?fail=0.3').failureRate).toBe(0.3)
    expect(parseRepositoryChoice('?fail=5').failureRate).toBe(1)
    expect(parseRepositoryChoice('?fail=-2').failureRate).toBe(0)
  })

  it('ignores an invalid failure rate', () => {
    for (const search of ['?fail=abc', '?fail=', '?fail=NaN', '?fail=Infinity']) {
      expect(parseRepositoryChoice(search).failureRate).toBe(persistenceConfig.mockFailureRate)
    }
  })
})

describe('selectRepository', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the localStorage repository by default', async () => {
    const storage = createMemoryStorage()
    await selectRepository('', storage).save(board)
    expect([...storage.data.keys()]).toEqual([persistenceConfig.storageKey])
  })

  it('returns the mock API repository for ?storage=api, with its own storage key', async () => {
    const storage = createMemoryStorage()
    const repository = selectRepository('?storage=api', storage)
    const loading = repository.load()
    await vi.advanceTimersByTimeAsync(persistenceConfig.mockLatencyMs.max)
    expect(await loading).toEqual({ kind: 'empty' })

    const saving = repository.save(board)
    await vi.advanceTimersByTimeAsync(persistenceConfig.mockLatencyMs.max)
    expect(await saving).toEqual({ kind: 'saved' })
    expect([...storage.data.keys()]).toEqual([persistenceConfig.mockServerKey])
  })
})
