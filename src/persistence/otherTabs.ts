import { persistenceConfig } from '../domain/config.ts'

// One instance per tab, shared by board and settings: two instances in the same tab would deliver
// to each other. It lives as long as the page, so it is never closed.
const channel = new BroadcastChannel(persistenceConfig.syncChannelName)

export function notifyOtherTabs(): void {
  channel.postMessage(null)
}

export function onOtherTabSaved(listener: () => void, signal: AbortSignal): void {
  channel.addEventListener('message', listener, { signal })
}
