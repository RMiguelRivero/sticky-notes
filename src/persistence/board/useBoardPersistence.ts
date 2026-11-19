import { type Dispatch, useCallback, useEffect, useRef, useState } from 'react'
import type { Board } from '../../domain/board.ts'
import type { BoardAction } from '../../domain/boardReducer.ts'
import { compactZ } from '../../domain/compactZ.ts'
import { persistenceConfig } from '../../domain/config.ts'
import { assertNever } from '../../utils/assertNever.ts'
import type { XOR } from '../../utils/types/xor.ts'
import type { BoardRepository, LoadResult } from './BoardRepository.ts'
import { createSaveScheduler, type SaveScheduler, type SaveStatus } from './saveScheduler.ts'
import { createTabSync } from './tabSync.ts'

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
  readonly flush: () => void
}

type LoadPhase = XOR<
  { readonly kind: 'loading' },
  { readonly kind: 'ready' },
  { readonly kind: 'error'; readonly message: string }
>

const CORRUPT_MESSAGE =
  'Saved data was unreadable and has been backed up. Starting with an empty board.'

export function useBoardPersistence(
  repository: BoardRepository,
  board: Board,
  dispatch: Dispatch<BoardAction>,
): BoardPersistence {
  const [loadPhase, setLoadPhase] = useState<LoadPhase>({ kind: 'loading' })
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ kind: 'idle' })
  // The board already in storage, which must never be saved: the caller's initial board, then each
  // board loaded.
  const storedBoardRef = useRef(board)
  const schedulerRef = useRef<SaveScheduler | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    let firstLoadDone = false

    // Tells this app's other tabs to reload after each save. The message carries no data, and a
    // channel never receives its own messages, so a tab does not reload its own saves.
    const channel = new BroadcastChannel(persistenceConfig.syncChannelName)
    const scheduler = createSaveScheduler({
      save: saveAndNotify,
      debounceMs: persistenceConfig.debounceMs,
      onStatus: reportSaveStatus,
    })
    const sync = createTabSync({
      load: () => repository.load(),
      canApply: () => firstLoadDone && !scheduler.hasUnsavedChanges(),
      apply: applyReloaded,
    })

    signal.addEventListener('abort', () => {
      channel.close()
      scheduler.dispose()
      schedulerRef.current = null
    })
    window.addEventListener('pagehide', () => scheduler.flush(), { signal })
    channel.addEventListener('message', () => sync.onPing(), { signal })
    void repository.load().then(applyFirstLoad)

    async function saveAndNotify(boardToSave: Board) {
      const result = await repository.save(boardToSave)
      // A save can finish after cleanup, when posting on the closed channel would throw.
      if (result.kind === 'saved' && !signal.aborted) {
        channel.postMessage(null) // notify other tabs to update their boards
      }
      return result
    }

    function reportSaveStatus(status: SaveStatus) {
      setSaveStatus(status)
      // A ping that arrived while this tab had unsaved changes was put on hold. Now that they are
      // saved, reload if one is waiting (otherwise this does nothing).
      if (status.kind === 'saved') {
        sync.reloadIfPingMissed()
      }
    }

    function applyLoaded(loadedBoard: Board) {
      const loaded = compactZ(loadedBoard)
      // Set before dispatching: the save effect runs for the dispatched board and must find it
      // already marked as stored, or it would save it back and ping the other tabs forever.
      storedBoardRef.current = loaded
      dispatch({ type: 'boardLoaded', board: loaded })
    }

    function applyReloaded(remoteBoard: Board) {
      if (!signal.aborted) {
        applyLoaded(remoteBoard)
      }
    }

    function applyFirstLoad(result: LoadResult) {
      if (signal.aborted) {
        return
      }
      switch (result.kind) {
        case 'loaded':
          applyLoaded(result.board)
          setLoadPhase({ kind: 'ready' })
          break
        case 'empty':
          // The initial board is already empty.
          setLoadPhase({ kind: 'ready' })
          break
        case 'corrupt':
          setLoadPhase({ kind: 'error', message: CORRUPT_MESSAGE })
          break
        case 'failed':
          setLoadPhase({
            kind: 'error',
            message: `Could not load the saved board (${result.message}). Starting with an empty board.`,
          })
          break
        default:
          assertNever(result)
      }
      firstLoadDone = true
      // Exposed only now, so edits made while loading (replaced by the loaded board) are not saved.
      schedulerRef.current = scheduler
      sync.reloadIfPingMissed()
    }

    return () => controller.abort()
  }, [repository, dispatch])

  // Depends on `board` only: loads set `storedBoardRef` before dispatching, so a loaded board is
  // skipped here without comparing against any other state.
  useEffect(() => {
    if (board !== storedBoardRef.current) {
      schedulerRef.current?.schedule(board)
    }
  }, [board])

  const flush = useCallback(() => schedulerRef.current?.flush(), [])

  switch (loadPhase.kind) {
    case 'loading':
      return { status: { kind: 'loading' }, flush }
    case 'ready':
      return { status: { kind: 'ready', save: saveStatus }, flush }
    case 'error':
      return { status: { kind: 'error', message: loadPhase.message, save: saveStatus }, flush }
    default:
      return assertNever(loadPhase)
  }
}
