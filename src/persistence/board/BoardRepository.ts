import type { Board } from '../../domain/board.ts'
import type { XOR } from '../../utils/types/xor.ts'
import type { SaveResult } from '../shared.ts'

export type LoadedResult = { readonly kind: 'loaded'; readonly board: Board }
export type EmptyResult = { readonly kind: 'empty' }
export type CorruptResult = { readonly kind: 'corrupt' }
export type LoadFailedResult = { readonly kind: 'failed'; readonly message: string }

export type LoadResult = XOR<LoadedResult, EmptyResult, CorruptResult, LoadFailedResult>

export type BoardRepository = {
  readonly load: () => Promise<LoadResult>
  readonly save: (board: Board) => Promise<SaveResult>
}
