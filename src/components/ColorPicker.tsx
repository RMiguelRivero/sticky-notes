import type { Dispatch } from 'react'
import { NOTE_COLORS, type NoteColor, type NoteId } from '../domain/board.ts'
import type { BoardAction } from '../domain/boardReducer.ts'
import './ColorPicker.css'

type Props = {
  readonly noteId: NoteId
  readonly color: NoteColor
  readonly dispatch: Dispatch<BoardAction>
}

const COLOR_NAMES: Readonly<Record<NoteColor, string>> = {
  yellow: 'Yellow',
  pink: 'Pink',
  blue: 'Blue',
  orange: 'Orange',
}

export function ColorPicker({ noteId, color, dispatch }: Props) {
  return (
    <fieldset className="color-picker">
      <legend className="color-picker__legend">Note color</legend>
      {NOTE_COLORS.map((option) => (
        <input
          key={option}
          type="radio"
          className="color-picker__swatch"
          name={`note-color-${noteId}`}
          aria-label={COLOR_NAMES[option]}
          checked={option === color}
          style={{ backgroundColor: `var(--note-${option})` }}
          onChange={() => dispatch({ type: 'noteColorChanged', id: noteId, color: option })}
        />
      ))}
    </fieldset>
  )
}
