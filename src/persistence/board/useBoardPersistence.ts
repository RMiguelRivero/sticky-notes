import { useCallback, useEffect, useRef, useState } from 'react'
import { type Board, createEmptyBoard } from '../../domain/board.ts'
import { compactZ } from '../../domain/compactZ.ts'
import { persistenceConfig } from '../../domain/config.ts'
import { assertNever } from '../../utils/assertNever.ts'
import type { XOR } from '../../utils/types/xor.ts'
import type { BoardRepository, LoadResult } from './BoardRepository.ts'
import { createSaveScheduler, type SaveScheduler, type SaveStatus } from './saveScheduler.ts'
import { createTabSync, type TabSync } from './tabSync.ts'

export type LoadingStatus = { readonly kind: 'loading' }
export type ReadyStatus = { readonly kind: 'ready'; readonly save: SaveStatus }
export type LoadErrorStatus = {
  readonly kind: 'error'
  readonly message: string
  readonly save: SaveStatus
}

export type PersistenceStatus = XOR<LoadingStatus, ReadyStatus, LoadErrorStatus>

export type BoardPersistence = {
  readonly status: PersistenceStatus
  readonly loadedBoard: Board | null
  readonly flush: () => void
}

type LoadingState = { readonly kind: 'loading' }
type ReadyState = { readonly kind: 'ready'; readonly board: Board }
type ErrorState = { readonly kind: 'error'; readonly board: Board; readonly message: string }

type LoadState = XOR<LoadingState, ReadyState, ErrorState>

const CORRUPT_MESSAGE =
  'Saved data was unreadable and has been backed up. Starting with an empty board.'

function toLoadState(result: LoadResult): LoadState {
  switch (result.kind) {
    case 'loaded':
      // Compacted here, not in the reducer, so the caller's state is this very object and is not
      // saved back (which would ping the other tabs into an endless reload loop).
      return { kind: 'ready', board: compactZ(result.board) }
    case 'empty':
      return { kind: 'ready', board: createEmptyBoard() }
    case 'corrupt':
      return { kind: 'error', board: createEmptyBoard(), message: CORRUPT_MESSAGE }
    case 'failed':
      return {
        kind: 'error',
        board: createEmptyBoard(),
        message: `Could not load the saved board (${result.message}). Starting with an empty board.`,
      }
    default:
      return assertNever(result)
  }
}

export function useBoardPersistence(repository: BoardRepository, board: Board): BoardPersistence {
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' })
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ kind: 'idle' })
  const schedulerRef = useRef<SaveScheduler | null>(null)
  const syncRef = useRef<TabSync | null>(null)
  const firstLoadDoneRef = useRef(false)
  // The last board seen from the caller, starting with the one it has before the load arrives.
  const lastBoardRef = useRef(board)

  useEffect(() => {
    let cancelled = false
    firstLoadDoneRef.current = false
    setLoad({ kind: 'loading' })
    void repository.load().then((result) => {
      if (!cancelled) {
        firstLoadDoneRef.current = true
        setLoad(toLoadState(result))
        syncRef.current?.retry()
      }
    })
    return () => {
      cancelled = true
    }
  }, [repository])

  useEffect(() => {
    let disposed = false
    // Tells this app's other tabs to reload after each save. The message carries no data, and a
    // channel never receives its own messages, so a tab does not reload its own saves.
    const channel = new BroadcastChannel(persistenceConfig.syncChannelName)
    const scheduler = createSaveScheduler({
      save: async (boardToSave) => {
        const result = await repository.save(boardToSave)
        // A save can finish after cleanup, when posting on the closed channel would throw.
        if (result.kind === 'saved' && !disposed) {
          channel.postMessage(null)
        }
        return result
      },
      debounceMs: persistenceConfig.debounceMs,
      onStatus: setSaveStatus,
    })
    const sync = createTabSync({
      load: () => repository.load(),
      canApply: () => firstLoadDoneRef.current && !scheduler.hasUnsavedChanges(),
      apply: (remoteBoard) => {
        if (!disposed) {
          setLoad({ kind: 'ready', board: compactZ(remoteBoard) })
        }
      },
    })
    schedulerRef.current = scheduler
    syncRef.current = sync
    channel.onmessage = () => sync.onPing()
    const flushOnHide = () => scheduler.flush()
    window.addEventListener('pagehide', flushOnHide)
    return () => {
      disposed = true
      window.removeEventListener('pagehide', flushOnHide)
      channel.close()
      scheduler.dispose()
      schedulerRef.current = null
      syncRef.current = null
    }
  }, [repository])

  // A save that succeeded may be what a deferred reload was waiting for.
  useEffect(() => {
    if (saveStatus.kind === 'saved') {
      syncRef.current?.retry()
    }
  }, [saveStatus])

  useEffect(() => {
    // Only a board the caller changed is saved. A newly loaded board re-runs this effect while
    // the caller still holds its previous board, and that stale board must not be saved over it.
    if (board === lastBoardRef.current) {
      return
    }
    lastBoardRef.current = board
    if (load.kind === 'loading' || board === load.board) {
      return
    }
    schedulerRef.current?.schedule(board)
  }, [board, load])

  const flush = useCallback(() => schedulerRef.current?.flush(), [])

  switch (load.kind) {
    case 'loading':
      return { status: { kind: 'loading' }, loadedBoard: null, flush }
    case 'ready':
      return { status: { kind: 'ready', save: saveStatus }, loadedBoard: load.board, flush }
    case 'error':
      return {
        status: { kind: 'error', message: load.message, save: saveStatus },
        loadedBoard: load.board,
        flush,
      }
    default:
      return assertNever(load)
  }
}
