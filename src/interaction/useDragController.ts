import {
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  createNoteId,
  type Note,
  type NoteId,
  type Point,
  type Rect,
  type Size,
} from '../domain/board.ts'
import type { BoardAction } from '../domain/boardReducer.ts'
import { pointInRect } from '../domain/geometry.ts'
import { assertNever } from '../utils/assertNever.ts'
import {
  cancel,
  type DragState,
  finish,
  idleDrag,
  isDragging,
  previewRect,
  startCreating,
  startMoving,
  startResizing,
  update,
} from './drag.ts'

type Gesture = {
  readonly drag: DragState
  // Frozen at pointer-down so a drag cannot grow the board while it runs.
  readonly board: Size
}

const idleGesture: Gesture = { drag: idleDrag, board: { width: 0, height: 0 } }

/** What the UI draws for the current gesture. `kind` is `none` until the click/drag threshold. */
export type DragView = {
  readonly kind: 'none' | 'create' | 'move' | 'resize'
  readonly noteId: NoteId | null
  readonly rect: Rect | null
  readonly overTrash: boolean
}

const noDragView: DragView = { kind: 'none', noteId: null, rect: null, overTrash: false }

function toDragView({ drag, board }: Gesture): DragView {
  if (!isDragging(drag)) return noDragView
  const rect = previewRect(drag, board)
  switch (drag.kind) {
    case 'idle':
      return noDragView
    case 'creating':
      return { kind: 'create', noteId: null, rect, overTrash: false }
    case 'moving':
      return { kind: 'move', noteId: drag.noteId, rect, overTrash: drag.overTrash }
    case 'resizing':
      return { kind: 'resize', noteId: drag.noteId, rect, overTrash: false }
    default:
      return assertNever(drag)
  }
}

// Mutable on purpose: pointer handlers need the latest drag state synchronously,
// which React state (updated on the next render) cannot give them.
type Session = {
  drag: DragState
  latestClient: Point | null
  frame: number | null
  readonly stop: (next: DragState) => void
}

type PointerStart = Pick<ReactPointerEvent, 'pointerId' | 'clientX' | 'clientY'>

type Options = {
  readonly notes: readonly Note[]
  readonly dispatch: Dispatch<BoardAction>
  readonly canvasRef: RefObject<HTMLElement | null>
  readonly trashRef: RefObject<HTMLElement | null>
}

export type DragController = {
  readonly view: DragView
  readonly onCanvasPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
  readonly onMoveStart: (noteId: NoteId, event: ReactPointerEvent<HTMLElement>) => void
  readonly onResizeStart: (noteId: NoteId, event: ReactPointerEvent<HTMLElement>) => void
}

export function useDragController({
  notes,
  dispatch,
  canvasRef,
  trashRef,
}: Options): DragController {
  const [gesture, setGesture] = useState<Gesture>(idleGesture)
  const sessionRef = useRef<Session | null>(null)
  // Lets the start handlers stay stable while still finding the note's current rect.
  const notesRef = useRef(notes)

  useEffect(() => {
    notesRef.current = notes
  }, [notes])

  useEffect(() => () => sessionRef.current?.stop(cancel()), [])

  const begin = useCallback(
    (element: HTMLElement, start: PointerStart, startDrag: (point: Point) => DragState) => {
      const canvas = canvasRef.current
      if (canvas === null || sessionRef.current !== null) return

      const canvasRect = canvas.getBoundingClientRect()
      const board: Size = { width: canvasRect.width, height: canvasRect.height }
      const toBoardPoint = (client: Point): Point => ({
        x: client.x - canvasRect.left,
        y: client.y - canvasRect.top,
      })
      const isOverTrash = (client: Point): boolean => {
        const trash = trashRef.current
        return trash !== null && pointInRect(client, trash.getBoundingClientRect())
      }
      const clientPoint = (event: PointerEvent | PointerStart): Point => ({
        x: event.clientX,
        y: event.clientY,
      })

      const { pointerId } = start
      element.setPointerCapture(pointerId)

      function apply(client: Point) {
        session.drag = update(session.drag, toBoardPoint(client), {
          overTrash: isOverTrash(client),
        })
        setGesture({ drag: session.drag, board })
      }

      function stop(next: DragState) {
        if (session.frame !== null) cancelAnimationFrame(session.frame)
        element.removeEventListener('pointermove', onPointerMove)
        element.removeEventListener('pointerup', onPointerUp)
        element.removeEventListener('pointercancel', onAbort)
        element.removeEventListener('lostpointercapture', onAbort)
        window.removeEventListener('keydown', onKeyDown)
        if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId)
        sessionRef.current = null
        setGesture({ drag: next, board })
      }

      // One state update per animation frame, however many pointermoves arrive.
      function onFrame() {
        session.frame = null
        if (session.latestClient !== null) apply(session.latestClient)
      }

      function onPointerMove(event: PointerEvent) {
        if (event.pointerId !== pointerId) return
        session.latestClient = clientPoint(event)
        session.frame ??= requestAnimationFrame(onFrame)
      }

      function onPointerUp(event: PointerEvent) {
        if (event.pointerId !== pointerId) return
        // Use the release position, not the last frame's, so the commit matches the pointer.
        const client = clientPoint(event)
        apply(client)
        const action = finish(session.drag, {
          board,
          overTrash: isOverTrash(client),
          newNoteId: createNoteId,
        })
        stop(idleDrag)
        if (action !== null) dispatch(action)
      }

      function onAbort(event: Event) {
        if (event instanceof PointerEvent && event.pointerId !== pointerId) return
        stop(cancel())
      }

      function onKeyDown(event: KeyboardEvent) {
        if (event.key === 'Escape') stop(cancel())
      }

      const session: Session = {
        drag: startDrag(toBoardPoint(clientPoint(start))),
        latestClient: null,
        frame: null,
        stop,
      }
      sessionRef.current = session
      setGesture({ drag: session.drag, board })

      element.addEventListener('pointermove', onPointerMove)
      element.addEventListener('pointerup', onPointerUp)
      element.addEventListener('pointercancel', onAbort)
      element.addEventListener('lostpointercapture', onAbort)
      window.addEventListener('keydown', onKeyDown)
    },
    [canvasRef, trashRef, dispatch],
  )

  const onCanvasPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      // Only the empty canvas creates notes; presses on notes bubble up here too.
      if (event.target !== event.currentTarget || event.button !== 0) return
      begin(event.currentTarget, event, startCreating)
    },
    [begin],
  )

  const onMoveStart = useCallback(
    (noteId: NoteId, event: ReactPointerEvent<HTMLElement>) => {
      const note = notesRef.current.find((candidate) => candidate.id === noteId)
      if (note === undefined || event.button !== 0) return
      begin(event.currentTarget, event, (point) => startMoving(note, point))
    },
    [begin],
  )

  const onResizeStart = useCallback(
    (noteId: NoteId, event: ReactPointerEvent<HTMLElement>) => {
      const note = notesRef.current.find((candidate) => candidate.id === noteId)
      if (note === undefined || event.button !== 0) return
      begin(event.currentTarget, event, (point) => startResizing(note, point))
    },
    [begin],
  )

  return { view: toDragView(gesture), onCanvasPointerDown, onMoveStart, onResizeStart }
}
