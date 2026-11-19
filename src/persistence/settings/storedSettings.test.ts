import { describe, expect, it } from 'vitest'
import { persistenceConfig } from '../../domain/config.ts'
import type { Settings } from '../../domain/settings.ts'
import {
  parseStoredSettingsJson,
  storedSettingsSchema,
  toStoredSettings,
} from './storedSettings.ts'

const settings: Settings = { snapToGrid: true }

describe('storedSettingsSchema', () => {
  it('accepts versioned settings', () => {
    expect(storedSettingsSchema.safeParse(toStoredSettings(settings)).success).toBe(true)
  })

  it('rejects another version', () => {
    const wrong = { version: persistenceConfig.settingsSchemaVersion + 1, settings }
    expect(storedSettingsSchema.safeParse(wrong).success).toBe(false)
  })

  it('rejects bare settings without the envelope', () => {
    expect(storedSettingsSchema.safeParse(settings).success).toBe(false)
  })

  it('rejects a setting of the wrong type', () => {
    const wrong = {
      version: persistenceConfig.settingsSchemaVersion,
      settings: { snapToGrid: 'yes' },
    }
    expect(storedSettingsSchema.safeParse(wrong).success).toBe(false)
  })
})

describe('parseStoredSettingsJson', () => {
  it('round-trips settings', () => {
    const raw = JSON.stringify(toStoredSettings(settings))
    expect(parseStoredSettingsJson(raw)).toEqual(settings)
  })

  it('returns null for invalid JSON', () => {
    expect(parseStoredSettingsJson('{not json')).toBeNull()
  })

  it('returns null for valid JSON of the wrong shape', () => {
    expect(parseStoredSettingsJson('{"snapToGrid":true}')).toBeNull()
    expect(parseStoredSettingsJson('null')).toBeNull()
  })
})
