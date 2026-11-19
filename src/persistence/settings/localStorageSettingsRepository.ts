import { persistenceConfig } from '../../domain/config.ts'
import { defaultSettings, type Settings } from '../../domain/settings.ts'
import { describeError, type KeyValueStorage, type SaveResult } from '../shared.ts'
import type { SettingsRepository } from './SettingsRepository.ts'
import { parseStoredSettingsJson, toStoredSettings } from './storedSettings.ts'

export function createLocalStorageSettingsRepository(storage: KeyValueStorage): SettingsRepository {
  return {
    async load(): Promise<Settings> {
      try {
        const raw = storage.getItem(persistenceConfig.settingsStorageKey)
        return (raw === null ? null : parseStoredSettingsJson(raw)) ?? defaultSettings
      } catch {
        return defaultSettings
      }
    },

    async save(settings: Settings): Promise<SaveResult> {
      try {
        storage.setItem(
          persistenceConfig.settingsStorageKey,
          JSON.stringify(toStoredSettings(settings)),
        )
        return { kind: 'saved' }
      } catch (error) {
        return { kind: 'failed', message: describeError(error) }
      }
    },
  }
}
