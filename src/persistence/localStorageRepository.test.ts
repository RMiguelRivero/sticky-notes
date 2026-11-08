import { describe, expect, it } from 'vitest'
import { type Board, createNoteId } from '../domain/board.ts'
import { noteConfig, persistenceConfig } from '../domain/config.ts'
import type { KeyValueStorage } from './BoardRepository.ts'
import { createLocalStorageRepository } from './localStorageRepository.ts'
import { toStoredBoard } from './storedBoard.ts'

function createMemoryStorage(initial: Record<string, string> = {}): KeyValueStorage & {
  readonly data: Map<string, string>
} {
  const data = new Map(Object.entries(initial))
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

function throwingStorage(): KeyValueStorage {
  const fail = (): never => {
    throw new Error('storage unavailable')
  }
  return { getItem: fail, setItem: fail, removeItem: fail }
}

const board: Board = {
  title: 'Plans',
  notes: [
    {
      id: createNoteId(),
      rect: { x: 0, y: 0, width: noteConfig.defaultWidth, height: noteConfig.defaultHeight },
      text: 'hi',
      color: noteConfig.defaultColor,
      z: 1,
    },
  ],
}

const backupKey = persistenceConfig.storageKey + persistenceConfig.backupSuffix

describe('localStorage repository', () => {
  it('loads empty when nothing is stored', async () => {
    const repository = createLocalStorageRepository(createMemoryStorage())
    expect(await repository.load()).toEqual({ kind: 'empty' })
  })

  it('saves and loads the same board', async () => {
    const storage = createMemoryStorage()
    const repository = createLocalStorageRepository(storage)
    expect(await repository.save(board)).toEqual({ kind: 'saved' })
    expect(storage.data.get(persistenceConfig.storageKey)).toBe(
      JSON.stringify(toStoredBoard(board)),
    )
    expect(await repository.load()).toEqual({ kind: 'loaded', board })
  })

  it('reports corrupt data and backs it up', async () => {
    const storage = createMemoryStorage({ [persistenceConfig.storageKey]: '{"version":1}' })
    const repository = createLocalStorageRepository(storage)
    expect(await repository.load()).toEqual({ kind: 'corrupt' })
    expect(storage.data.get(backupKey)).toBe('{"version":1}')
  })

  it('reports unparseable text as corrupt', async () => {
    const storage = createMemoryStorage({ [persistenceConfig.storageKey]: 'not json' })
    expect(await createLocalStorageRepository(storage).load()).toEqual({ kind: 'corrupt' })
    expect(storage.data.get(backupKey)).toBe('not json')
  })

  it('does not overwrite an existing backup', async () => {
    const storage = createMemoryStorage({
      [persistenceConfig.storageKey]: 'second bad copy',
      [backupKey]: 'first bad copy',
    })
    await createLocalStorageRepository(storage).load()
    expect(storage.data.get(backupKey)).toBe('first bad copy')
  })

  it('turns a throwing storage into failed results', async () => {
    const repository = createLocalStorageRepository(throwingStorage())
    expect(await repository.load()).toEqual({ kind: 'failed', message: 'storage unavailable' })
    expect(await repository.save(board)).toEqual({ kind: 'failed', message: 'storage unavailable' })
  })
})
