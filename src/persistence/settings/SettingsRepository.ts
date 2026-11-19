import type { Settings } from '../../domain/settings.ts'
import type { SaveResult } from '../shared.ts'

export type SettingsRepository = {
  readonly load: () => Promise<Settings>
  readonly save: (settings: Settings) => Promise<SaveResult>
}
