import { boardConfig } from './config.ts'

export type Point = { readonly x: number; readonly y: number }
export type Size = { readonly width: number; readonly height: number }
export type Rect = Point & Size

export const NOTE_COLORS = ['yellow', 'pink', 'blue', 'orange'] as const
export type NoteColor = (typeof NOTE_COLORS)[number]

declare const noteIdBrand: unique symbol
export type NoteId = string & { readonly [noteIdBrand]: true }

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isNoteId(value: string): value is NoteId {
  return UUID_PATTERN.test(value)
}

export function createNoteId(): NoteId {
  const id = crypto.randomUUID()
  if (!isNoteId(id)) {
    throw new Error(`crypto.randomUUID returned an invalid id: ${id}`)
  }
  return id
}

export type Note = {
  readonly id: NoteId
  readonly rect: Rect
  readonly text: string
  readonly color: NoteColor
  readonly z: number
}

export type Board = {
  readonly title: string
  readonly notes: readonly Note[]
}

export function createEmptyBoard(): Board {
  return { title: boardConfig.defaultTitle, notes: [] }
}
