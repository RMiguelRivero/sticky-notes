import { useCallback, useEffect, useRef, useState } from 'react'
import { type Board, createEmptyBoard } from '../domain/board.ts'
import { persistenceConfig } from '../domain/config.ts'
import { assertNever } from '../utils/assertNever.ts'
import type { XOR } from '../utils/types/xor.ts'
import type { BoardRepository, LoadResult } from './BoardRepository.ts'
import { createSaveScheduler, type SaveScheduler, type SaveStatus } from './saveScheduler.ts'

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
      return { kind: 'ready', board: result.board }
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
  // The board the caller starts with, before the loaded one arrives. It is never saved.
  const initialBoardRef = useRef(board)

  useEffect(() => {
    let cancelled = false
    setLoad({ kind: 'loading' })
    void repository.load().then((result) => {
      if (!cancelled) {
        setLoad(toLoadState(result))
      }
    })
    return () => {
      cancelled = true
    }
  }, [repository])

  useEffect(() => {
    const scheduler = createSaveScheduler({
      save: (boardToSave) => repository.save(boardToSave),
      debounceMs: persistenceConfig.debounceMs,
      onStatus: setSaveStatus,
    })
    schedulerRef.current = scheduler
    const flushOnHide = () => scheduler.flush()
    window.addEventListener('pagehide', flushOnHide)
    return () => {
      window.removeEventListener('pagehide', flushOnHide)
      scheduler.dispose()
      schedulerRef.current = null
    }
  }, [repository])

  useEffect(() => {
    if (load.kind === 'loading') {
      return
    }
    if (board === load.board || board === initialBoardRef.current) {
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
