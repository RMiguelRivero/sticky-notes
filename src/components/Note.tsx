import { type Dispatch, memo, type PointerEvent as ReactPointerEvent } from 'react'
import type { NoteId, Note as NoteModel, Rect } from '../domain/board.ts'
import type { BoardAction } from '../domain/boardReducer.ts'
import { noteConfig } from '../domain/config.ts'
import { ColorPicker } from './ColorPicker.tsx'
import './Note.css'

type Props = {
  readonly note: NoteModel
  // Set only for the note being dragged, so idle notes get identical props on every frame.
  readonly previewRect: Rect | undefined
  readonly overTrash: boolean
  readonly dispatch: Dispatch<BoardAction>
  readonly onMoveStart: (noteId: NoteId, event: ReactPointerEvent<HTMLElement>) => void
  readonly onResizeStart: (noteId: NoteId, event: ReactPointerEvent<HTMLElement>) => void
}

const LABEL_WORDS = 5

function noteLabel(text: string): string {
  const words = text
    .trim()
    .split(/\s+/)
    .filter((word) => word !== '')
  if (words.length === 0) return 'Empty note'
  const excerpt = words.slice(0, LABEL_WORDS).join(' ')
  return `Note: ${excerpt}${words.length > LABEL_WORDS ? '…' : ''}`
}

function NoteComponent({
  note,
  previewRect,
  overTrash,
  dispatch,
  onMoveStart,
  onResizeStart,
}: Props) {
  const rect = previewRect ?? note.rect
  return (
    <article
      className="note"
      aria-label={noteLabel(note.text)}
      data-over-trash={overTrash ? 'true' : undefined}
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        zIndex: note.z,
        backgroundColor: `var(--note-${note.color})`,
      }}
      onPointerDownCapture={() => dispatch({ type: 'noteBroughtToFront', id: note.id })}
    >
      <button
        type="button"
        className="note__move"
        onPointerDown={(event) => onMoveStart(note.id, event)}
      >
        Move note
      </button>
      <textarea
        className="note__text"
        aria-label="Note text"
        maxLength={noteConfig.maxTextLength}
        value={note.text}
        onChange={(event) =>
          dispatch({ type: 'noteTextChanged', id: note.id, text: event.target.value })
        }
      />
      <div className="note__footer">
        <ColorPicker noteId={note.id} color={note.color} dispatch={dispatch} />
      </div>
      <button
        type="button"
        className="note__resize"
        aria-label="Resize note"
        onPointerDown={(event) => onResizeStart(note.id, event)}
      />
    </article>
  )
}

export const Note = memo(NoteComponent)
