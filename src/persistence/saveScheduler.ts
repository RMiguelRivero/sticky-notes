import type { Board } from '../domain/board.ts'
import { assertNever } from '../utils/assertNever.ts'
import type { XOR } from '../utils/types/xor.ts'
import { describeError, type SaveResult } from './BoardRepository.ts'

export type IdleSave = { readonly kind: 'idle' }
export type PendingSave = { readonly kind: 'pending' }
export type SavingSave = { readonly kind: 'saving' }
export type SavedSave = { readonly kind: 'saved' }
export type ErrorSave = { readonly kind: 'error'; readonly message: string }

export type SaveStatus = XOR<IdleSave, PendingSave, SavingSave, SavedSave, ErrorSave>

export type SaveSchedulerOptions = {
  readonly save: (board: Board) => Promise<SaveResult>
  readonly debounceMs: number
  readonly onStatus: (status: SaveStatus) => void
}

export type SaveScheduler = {
  readonly schedule: (board: Board) => void
  readonly flush: () => void
  readonly dispose: () => void
}

export function createSaveScheduler({
  save,
  debounceMs,
  onStatus,
}: SaveSchedulerOptions): SaveScheduler {
  // Only the latest board matters: older unsaved boards are replaced, not queued.
  let pending: Board | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let saving = false
  let disposed = false

  // A function, so TypeScript does not keep the narrowed type from before an `await`.
  function hasPending(): boolean {
    return pending !== null
  }

  function setStatus(status: SaveStatus): void {
    if (!disposed) {
      onStatus(status)
    }
  }

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  async function startSave(): Promise<void> {
    // Never two saves at once: the running save starts the follow-up when it ends.
    if (saving || pending === null) {
      return
    }
    const board = pending
    pending = null
    saving = true
    setStatus({ kind: 'saving' })

    let result: SaveResult
    try {
      result = await save(board)
    } catch (error) {
      result = { kind: 'failed', message: describeError(error) }
    }
    saving = false

    switch (result.kind) {
      case 'saved':
        setStatus(hasPending() ? { kind: 'pending' } : { kind: 'saved' })
        break
      case 'failed':
        setStatus({ kind: 'error', message: result.message })
        break
      default:
        assertNever(result)
    }

    // If the debounce timer is still running, it will start the follow-up itself.
    if (hasPending() && timer === null && !disposed) {
      void startSave()
    }
  }

  return {
    schedule(board) {
      if (disposed) {
        return
      }
      pending = board
      clearTimer()
      timer = setTimeout(() => {
        timer = null
        void startSave()
      }, debounceMs)
      if (!saving) {
        setStatus({ kind: 'pending' })
      }
    },

    flush() {
      if (disposed) {
        return
      }
      clearTimer()
      void startSave()
    },

    dispose() {
      disposed = true
      pending = null
      clearTimer()
    },
  }
}
