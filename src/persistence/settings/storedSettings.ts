import { z } from 'zod'
import { persistenceConfig } from '../../domain/config.ts'
import { type Settings, settingsSchema } from '../../domain/settings.ts'

export type StoredSettings = {
  readonly version: typeof persistenceConfig.settingsSchemaVersion
  readonly settings: Settings
}

export const storedSettingsSchema = z
  .object({
    version: z.literal(persistenceConfig.settingsSchemaVersion),
    settings: settingsSchema,
  })
  .readonly() satisfies z.ZodType<StoredSettings>

export function toStoredSettings(settings: Settings): StoredSettings {
  return { version: persistenceConfig.settingsSchemaVersion, settings }
}

export function parseStoredSettingsJson(raw: string): Settings | null {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  const parsed = storedSettingsSchema.safeParse(data)
  return parsed.success ? parsed.data.settings : null
}
