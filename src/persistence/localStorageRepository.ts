import type { Board } from '../domain/board.ts'
import { persistenceConfig } from '../domain/config.ts'
import {
  type BoardRepository,
  describeError,
  type KeyValueStorage,
  type LoadResult,
  type SaveResult,
} from './BoardRepository.ts'
import { parseStoredBoardJson, toStoredBoard } from './storedBoard.ts'

// Keeps the first bad copy: a later bad load must not overwrite it.
function backUpCorruptData(storage: KeyValueStorage, raw: string): void {
  const backupKey = persistenceConfig.storageKey + persistenceConfig.backupSuffix
  if (storage.getItem(backupKey) === null) {
    storage.setItem(backupKey, raw)
  }
}

export function createLocalStorageRepository(storage: KeyValueStorage): BoardRepository {
  return {
    async load(): Promise<LoadResult> {
      try {
        const raw = storage.getItem(persistenceConfig.storageKey)
        if (raw === null) {
          return { kind: 'empty' }
        }
        const board = parseStoredBoardJson(raw)
        if (board === null) {
          backUpCorruptData(storage, raw)
          return { kind: 'corrupt' }
        }
        return { kind: 'loaded', board }
      } catch (error) {
        return { kind: 'failed', message: describeError(error) }
      }
    },

    async save(board: Board): Promise<SaveResult> {
      try {
        storage.setItem(persistenceConfig.storageKey, JSON.stringify(toStoredBoard(board)))
        return { kind: 'saved' }
      } catch (error) {
        return { kind: 'failed', message: describeError(error) }
      }
    },
  }
}
