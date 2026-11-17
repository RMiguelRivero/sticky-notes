import {
  type ChangeEvent,
  type Dispatch,
  memo,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { NoteId, Note as NoteModel, Rect } from '../domain/board.ts'
import type { BoardAction } from '../domain/boardReducer.ts'
import { noteConfig } from '../domain/config.ts'
import type { KeyboardKind } from '../interaction/keyboard.ts'
import { NoteMenu } from './NoteMenu.tsx'
import './Note.css'

type Props = {
  readonly note: NoteModel
  // Set only for the note being dragged, so idle notes get identical props on every frame.
  readonly previewRect: Rect | undefined
  readonly overTrash: boolean
  readonly dispatch: Dispatch<BoardAction>
  readonly onMoveStart: (noteId: NoteId, event: ReactPointerEvent<HTMLElement>) => void
  readonly onResizeStart: (noteId: NoteId, event: ReactPointerEvent<HTMLElement>) => void
  readonly onKey: (
    noteId: NoteId,
    kind: KeyboardKind,
    event: ReactKeyboardEvent<HTMLElement>,
  ) => void
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
  onKey,
}: Props) {
  const rect = previewRect ?? note.rect
  const bringToFront = () => dispatch({ type: 'noteBroughtToFront', id: note.id })
  const handleMovePointerDown = (event: ReactPointerEvent<HTMLElement>) =>
    onMoveStart(note.id, event)
  const handleMoveKeyDown = (event: ReactKeyboardEvent<HTMLElement>) =>
    onKey(note.id, 'move', event)
  const handleResizePointerDown = (event: ReactPointerEvent<HTMLElement>) =>
    onResizeStart(note.id, event)
  const handleResizeKeyDown = (event: ReactKeyboardEvent<HTMLElement>) =>
    onKey(note.id, 'resize', event)
  const handleTextChange = (event: ChangeEvent<HTMLTextAreaElement>) =>
    dispatch({ type: 'noteTextChanged', id: note.id, text: event.target.value })

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
      onPointerDownCapture={bringToFront}
      onFocus={bringToFront}
    >
      <div className="note__header">
        <button
          type="button"
          className="note__move"
          aria-label="Move note"
          onPointerDown={handleMovePointerDown}
          onKeyDown={handleMoveKeyDown}
        />
        <NoteMenu noteId={note.id} color={note.color} dispatch={dispatch} />
      </div>
      <textarea
        className="note__text"
        aria-label="Note text"
        maxLength={noteConfig.maxTextLength}
        value={note.text}
        onChange={handleTextChange}
      />
      <button
        type="button"
        className="note__resize"
        aria-label="Resize note"
        onPointerDown={handleResizePointerDown}
        onKeyDown={handleResizeKeyDown}
      />
    </article>
  )
}

export const Note = memo(NoteComponent)
