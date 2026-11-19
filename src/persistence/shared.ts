import type { XOR } from '../utils/types/xor.ts'

export type SavedResult = { readonly kind: 'saved' }
export type SaveFailedResult = { readonly kind: 'failed'; readonly message: string }

export type SaveResult = XOR<SavedResult, SaveFailedResult>

export type KeyValueStorage = {
  readonly getItem: (key: string) => string | null
  readonly setItem: (key: string, value: string) => void
  readonly removeItem: (key: string) => void
}

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
