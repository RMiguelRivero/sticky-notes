import { describe, expect, it } from 'vitest'
import { persistenceConfig } from '../../domain/config.ts'
import { defaultSettings } from '../../domain/settings.ts'
import type { KeyValueStorage } from '../shared.ts'
import { createLocalStorageSettingsRepository } from './localStorageSettingsRepository.ts'
import { toStoredSettings } from './storedSettings.ts'

function createMemoryStorage(initial: Record<string, string> = {}): KeyValueStorage {
  const data = new Map(Object.entries(initial))
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

function throwingStorage(): KeyValueStorage {
  const fail = (): never => {
    throw new Error('storage unavailable')
  }
  return { getItem: fail, setItem: fail, removeItem: fail }
}

describe('createLocalStorageSettingsRepository', () => {
  it('loads the defaults when nothing is stored', async () => {
    const repository = createLocalStorageSettingsRepository(createMemoryStorage())
    expect(await repository.load()).toEqual(defaultSettings)
  })

  it('saves under the settings key and loads the same settings back', async () => {
    const storage = createMemoryStorage()
    const repository = createLocalStorageSettingsRepository(storage)
    expect(await repository.save({ snapToGrid: true })).toEqual({ kind: 'saved' })
    expect(storage.getItem(persistenceConfig.settingsStorageKey)).toBe(
      JSON.stringify(toStoredSettings({ snapToGrid: true })),
    )
    expect(await repository.load()).toEqual({ snapToGrid: true })
  })

  it('does not touch the board key', async () => {
    const storage = createMemoryStorage()
    await createLocalStorageSettingsRepository(storage).save({ snapToGrid: true })
    expect(storage.getItem(persistenceConfig.storageKey)).toBeNull()
  })

  it('falls back to the defaults for corrupt or invalid data', async () => {
    for (const raw of ['{not json', '{"snapToGrid":true}', 'null']) {
      const storage = createMemoryStorage({ [persistenceConfig.settingsStorageKey]: raw })
      expect(await createLocalStorageSettingsRepository(storage).load()).toEqual(defaultSettings)
    }
  })

  it('falls back to the defaults when storage throws on load', async () => {
    const repository = createLocalStorageSettingsRepository(throwingStorage())
    expect(await repository.load()).toEqual(defaultSettings)
  })

  it('reports a failed save instead of throwing', async () => {
    const repository = createLocalStorageSettingsRepository(throwingStorage())
    expect(await repository.save({ snapToGrid: true })).toEqual({
      kind: 'failed',
      message: 'storage unavailable',
    })
  })
})
