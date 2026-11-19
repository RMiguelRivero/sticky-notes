import { useCallback, useEffect, useState } from 'react'
import { defaultSettings, type Settings } from '../../domain/settings.ts'
import { notifyOtherTabs, onOtherTabSaved } from '../otherTabs.ts'
import type { SettingsRepository } from './SettingsRepository.ts'

export type SettingsState = {
  readonly settings: Settings
  readonly setSnapToGrid: (snapToGrid: boolean) => void
}

export function useSettings(repository: SettingsRepository): SettingsState {
  const [settings, setSettings] = useState<Settings>(defaultSettings)

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller

    function reload() {
      void repository.load().then((loaded) => {
        if (!signal.aborted) {
          setSettings(loaded)
        }
      })
    }

    onOtherTabSaved(reload, signal)
    reload()
    return () => controller.abort()
  }, [repository])

  // Saved from the handler, not an effect, so the initial defaults can never overwrite stored ones.
  const setSnapToGrid = useCallback(
    (snapToGrid: boolean) => {
      const next: Settings = { ...settings, snapToGrid }
      setSettings(next)
      void repository.save(next).then((result) => {
        if (result.kind === 'saved') {
          notifyOtherTabs()
        }
      })
    },
    [repository, settings],
  )

  return { settings, setSnapToGrid }
}
