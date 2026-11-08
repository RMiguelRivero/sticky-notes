import type { Dispatch } from 'react'
import { NOTE_COLORS, type NoteColor, type NoteId } from '../domain/board.ts'
import type { BoardAction } from '../domain/boardReducer.ts'
import './ColorPicker.css'

type Props = {
  readonly noteId: NoteId
  readonly color: NoteColor
  readonly dispatch: Dispatch<BoardAction>
  // Called after a color is chosen, so the menu can close.
  readonly onPick: () => void
}

const COLOR_NAMES: Readonly<Record<NoteColor, string>> = {
  yellow: 'Yellow',
  pink: 'Pink',
  blue: 'Blue',
  orange: 'Orange',
}

export function ColorPicker({ noteId, color, dispatch, onPick }: Props) {
  return (
    <fieldset className="color-picker">
      <legend className="color-picker__legend">Note color</legend>
      {NOTE_COLORS.map((option) => (
        <input
          key={option}
          type="radio"
          className="color-picker__swatch"
          data-color={option}
          name={`note-color-${noteId}`}
          aria-label={COLOR_NAMES[option]}
          checked={option === color}
          onChange={() => {
            dispatch({ type: 'noteColorChanged', id: noteId, color: option })
            onPick()
          }}
        />
      ))}
    </fieldset>
  )
}
