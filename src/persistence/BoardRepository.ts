import type { Board } from '../domain/board.ts'
import type { XOR } from '../utils/types/xor.ts'

export type LoadedResult = { readonly kind: 'loaded'; readonly board: Board }
export type EmptyResult = { readonly kind: 'empty' }
export type CorruptResult = { readonly kind: 'corrupt' }
export type LoadFailedResult = { readonly kind: 'failed'; readonly message: string }

export type LoadResult = XOR<LoadedResult, EmptyResult, CorruptResult, LoadFailedResult>

export type SavedResult = { readonly kind: 'saved' }
export type SaveFailedResult = { readonly kind: 'failed'; readonly message: string }

export type SaveResult = XOR<SavedResult, SaveFailedResult>

// Both methods report problems as results and never throw, so callers need no try/catch.
export type BoardRepository = {
  readonly load: () => Promise<LoadResult>
  readonly save: (board: Board) => Promise<SaveResult>
}

export type KeyValueStorage = {
  readonly getItem: (key: string) => string | null
  readonly setItem: (key: string, value: string) => void
  readonly removeItem: (key: string) => void
}

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
