import { assertNever } from '../utils/assertNever.ts'
import type { XOR } from '../utils/types/xor.ts'
import type { Board, Note, NoteColor, NoteId, Rect } from './board.ts'
import { boardConfig, noteConfig } from './config.ts'
import { enforceMinSize } from './geometry.ts'

export type NoteCreatedAction = {
  readonly type: 'noteCreated'
  readonly id: NoteId
  readonly rect: Rect
  readonly color?: NoteColor
}
export type NoteMovedAction = {
  readonly type: 'noteMoved'
  readonly id: NoteId
  readonly rect: Rect
}
export type NoteResizedAction = {
  readonly type: 'noteResized'
  readonly id: NoteId
  readonly rect: Rect
}
export type NoteDeletedAction = {
  readonly type: 'noteDeleted'
  readonly id: NoteId
}
export type NoteBroughtToFrontAction = {
  readonly type: 'noteBroughtToFront'
  readonly id: NoteId
}
export type NoteTextChangedAction = {
  readonly type: 'noteTextChanged'
  readonly id: NoteId
  readonly text: string
}
export type NoteColorChangedAction = {
  readonly type: 'noteColorChanged'
  readonly id: NoteId
  readonly color: NoteColor
}
export type TitleChangedAction = {
  readonly type: 'titleChanged'
  readonly title: string
}
export type BoardLoadedAction = {
  readonly type: 'boardLoaded'
  readonly board: Board
}

export type BoardAction = XOR<
  NoteCreatedAction,
  NoteMovedAction,
  NoteResizedAction,
  NoteDeletedAction,
  NoteBroughtToFrontAction,
  NoteTextChangedAction,
  NoteColorChangedAction,
  TitleChangedAction,
  BoardLoadedAction
>

function maxZ(notes: readonly Note[]): number {
  return notes.reduce((max, note) => Math.max(max, note.z), 0)
}

function withMinSize(rect: Rect): Rect {
  return { x: rect.x, y: rect.y, ...enforceMinSize(rect) }
}

function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

// Returns the same state when the note is unknown or the update changes nothing.
function updateNote(state: Board, id: NoteId, update: (note: Note) => Note): Board {
  const current = state.notes.find((note) => note.id === id)
  if (current === undefined) return state
  const next = update(current)
  if (next === current) return state
  return { ...state, notes: state.notes.map((note) => (note === current ? next : note)) }
}

function setRect(state: Board, id: NoteId, rect: Rect): Board {
  const next = withMinSize(rect)
  return updateNote(state, id, (note) =>
    sameRect(note.rect, next) ? note : { ...note, rect: next },
  )
}

function compactZ(board: Board): Board {
  const ranked = [...board.notes].sort((a, b) => a.z - b.z)
  const rankById = new Map(ranked.map((note, index) => [note.id, index + 1]))
  return {
    ...board,
    notes: board.notes.map((note) => ({ ...note, z: rankById.get(note.id) ?? note.z })),
  }
}

export function boardReducer(state: Board, action: BoardAction): Board {
  switch (action.type) {
    case 'noteCreated': {
      if (state.notes.some((note) => note.id === action.id)) return state
      const note: Note = {
        id: action.id,
        rect: withMinSize(action.rect),
        text: '',
        color: action.color ?? noteConfig.defaultColor,
        z: maxZ(state.notes) + 1,
      }
      return { ...state, notes: [...state.notes, note] }
    }
    case 'noteMoved':
    case 'noteResized':
      return setRect(state, action.id, action.rect)
    case 'noteDeleted': {
      if (!state.notes.some((note) => note.id === action.id)) return state
      return { ...state, notes: state.notes.filter((note) => note.id !== action.id) }
    }
    case 'noteBroughtToFront': {
      const top = maxZ(state.notes)
      return updateNote(state, action.id, (note) =>
        note.z === top ? note : { ...note, z: top + 1 },
      )
    }
    case 'noteTextChanged': {
      const text = action.text.slice(0, noteConfig.maxTextLength)
      return updateNote(state, action.id, (note) => (note.text === text ? note : { ...note, text }))
    }
    case 'noteColorChanged':
      return updateNote(state, action.id, (note) =>
        note.color === action.color ? note : { ...note, color: action.color },
      )
    case 'titleChanged': {
      const title = action.title.slice(0, boardConfig.maxTitleLength)
      return title === state.title ? state : { ...state, title }
    }
    case 'boardLoaded':
      return compactZ(action.board)
    default:
      return assertNever(action)
  }
}
