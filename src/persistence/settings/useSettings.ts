import { useCallback, useEffect, useState } from 'react'
import { defaultSettings, type Settings } from '../../domain/settings.ts'
import type { SettingsRepository } from './SettingsRepository.ts'

export type SettingsState = {
  readonly settings: Settings
  readonly setSnapToGrid: (snapToGrid: boolean) => void
}

export function useSettings(repository: SettingsRepository): SettingsState {
  const [settings, setSettings] = useState<Settings>(defaultSettings)

  useEffect(() => {
    let cancelled = false
    repository.load().then((loaded) => {
      if (!cancelled) setSettings(loaded)
    })
    return () => {
      cancelled = true
    }
  }, [repository])

  // Saved from the handler, not an effect, so the initial defaults can never overwrite stored ones.
  const setSnapToGrid = useCallback(
    (snapToGrid: boolean) => {
      const next: Settings = { ...settings, snapToGrid }
      setSettings(next)
      repository.save(next)
    },
    [repository, settings],
  )

  return { settings, setSnapToGrid }
}
