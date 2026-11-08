import { type Dispatch, useEffect, useId, useRef, useState } from 'react'
import type { NoteColor, NoteId } from '../domain/board.ts'
import type { BoardAction } from '../domain/boardReducer.ts'
import { ColorPicker } from './ColorPicker.tsx'
import './NoteMenu.css'

type Props = {
  readonly noteId: NoteId
  readonly color: NoteColor
  readonly dispatch: Dispatch<BoardAction>
}

// A small disclosure menu: "Select color" expands the color choices, "Delete note" removes the note.
export function NoteMenu({ noteId, color, dispatch }: Props) {
  const [open, setOpen] = useState(false)
  const [colorOpen, setColorOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  // Closes on a press outside the menu or on Escape (Escape also returns focus to the trigger).
  useEffect(() => {
    if (!open) return

    const close = () => {
      setOpen(false)
      setColorOpen(false)
    }
    const onPointerDown = (event: PointerEvent) => {
      const inside = event.target instanceof Node && rootRef.current?.contains(event.target)
      if (inside !== true) close()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      close()
      triggerRef.current?.focus()
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="note-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="note-menu__trigger"
        aria-label="Note options"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="note-menu__dots" aria-hidden="true" />
      </button>
      {open && (
        <div id={panelId} className="note-menu__panel">
          <button
            type="button"
            className="note-menu__item"
            aria-expanded={colorOpen}
            onClick={() => setColorOpen((value) => !value)}
          >
            Select color
          </button>
          {colorOpen && (
            <ColorPicker
              noteId={noteId}
              color={color}
              dispatch={dispatch}
              onPick={() => {
                setOpen(false)
                setColorOpen(false)
              }}
            />
          )}
          {/* Hidden while the color choices are open, so the submenu replaces the list. */}
          {!colorOpen && (
            <button
              type="button"
              className="note-menu__item note-menu__item--danger"
              onClick={() => dispatch({ type: 'noteDeleted', id: noteId })}
            >
              Delete note
            </button>
          )}
        </div>
      )}
    </div>
  )
}
