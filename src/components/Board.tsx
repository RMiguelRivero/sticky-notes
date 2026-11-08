import { type Dispatch, useEffect, useMemo, useRef, useState } from 'react'
import type { Note as NoteModel, Size } from '../domain/board.ts'
import type { BoardAction } from '../domain/boardReducer.ts'
import { useDragController } from '../interaction/useDragController.ts'
import './Board.css'
import { Note } from './Note.tsx'
import { TrashZone } from './TrashZone.tsx'

type Props = {
  readonly notes: readonly NoteModel[]
  readonly dispatch: Dispatch<BoardAction>
}

// The board is at least as big as the visible area, and grows to hold the furthest note.
function logicalBoardSize(viewport: Size, notes: readonly NoteModel[]): Size {
  return notes.reduce<Size>(
    (size, { rect }) => ({
      width: Math.max(size.width, rect.x + rect.width),
      height: Math.max(size.height, rect.y + rect.height),
    }),
    viewport,
  )
}

export function Board({ notes, dispatch }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const trashRef = useRef<HTMLElement>(null)
  const [viewport, setViewport] = useState<Size>({ width: 0, height: 0 })

  useEffect(() => {
    const scroller = scrollRef.current
    if (scroller === null) return
    const measure = () =>
      setViewport((previous) =>
        previous.width === scroller.clientWidth && previous.height === scroller.clientHeight
          ? previous
          : { width: scroller.clientWidth, height: scroller.clientHeight },
      )
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(scroller)
    return () => observer.disconnect()
  }, [])

  const { view, onCanvasPointerDown, onMoveStart, onResizeStart } = useDragController({
    notes,
    dispatch,
    canvasRef,
    trashRef,
  })

  // The page root carries the drag kind so selection and cursor rules cover the whole page.
  useEffect(() => {
    if (view.kind === 'none') return
    const root = document.documentElement
    root.dataset.dragging = view.kind
    return () => {
      delete root.dataset.dragging
    }
  }, [view.kind])

  const boardSize = useMemo(() => logicalBoardSize(viewport, notes), [viewport, notes])

  return (
    <>
      <div className="board" ref={scrollRef}>
        <div
          className="board__canvas"
          ref={canvasRef}
          style={{ width: boardSize.width, height: boardSize.height }}
          onPointerDown={onCanvasPointerDown}
        >
          {notes.map((note) => {
            const dragged = note.id === view.noteId
            return (
              <Note
                key={note.id}
                note={note}
                previewRect={dragged ? (view.rect ?? undefined) : undefined}
                overTrash={dragged && view.overTrash}
                dispatch={dispatch}
                onMoveStart={onMoveStart}
                onResizeStart={onResizeStart}
              />
            )
          })}
          {view.kind === 'create' && view.rect !== null && (
            <div
              className="board__draft"
              aria-hidden="true"
              style={{
                left: view.rect.x,
                top: view.rect.y,
                width: view.rect.width,
                height: view.rect.height,
              }}
            />
          )}
        </div>
      </div>
      <TrashZone ref={trashRef} armed={view.kind === 'move'} pointerOver={view.overTrash} />
    </>
  )
}
