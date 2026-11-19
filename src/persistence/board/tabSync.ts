import type { Board } from '../../domain/board.ts'
import type { LoadResult } from './BoardRepository.ts'

export type TabSyncOptions = {
  readonly load: () => Promise<LoadResult>
  // False until the first load finished, and while this tab has unsaved changes.
  readonly canApply: () => boolean
  readonly apply: (board: Board) => void
}

export type TabSync = {
  // Another tab saved the board.
  readonly onPing: () => void
  // Applying may have become possible again: reload if a ping was missed meanwhile.
  readonly retry: () => void
}

export function createTabSync({ load, canApply, apply }: TabSyncOptions): TabSync {
  let missedPing = false
  let loadCount = 0

  async function reload(): Promise<void> {
    loadCount += 1
    const thisLoad = loadCount
    const result = await load()
    // Latest load wins: a newer load will apply its own, fresher result.
    if (thisLoad !== loadCount) {
      return
    }
    // The user changed something while loading: keep their edit and reload after it is saved.
    if (!canApply()) {
      missedPing = true
      return
    }
    // Empty, corrupt or failed reads keep the current board rather than wiping it.
    if (result.kind === 'loaded') {
      apply(result.board)
    }
  }

  return {
    onPing() {
      if (!canApply()) {
        missedPing = true
        return
      }
      void reload()
    },

    retry() {
      if (!missedPing) {
        return
      }
      missedPing = false
      void reload()
    },
  }
}
