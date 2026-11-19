import {
  type Dispatch,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
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
  createAtPoint,
  type DragState,
  finish,
  idleDrag,
  isDragging,
  previewRect,
  snapStepFor,
  startCreating,
  startMoving,
  startResizing,
  update,
} from './drag.ts'
import { applyKeyboardStep, type Direction, type KeyboardKind } from './keyboard.ts'

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
type LatestPointer = { readonly client: Point; readonly shift: boolean }

type Session = {
  drag: DragState
  latestPointer: LatestPointer | null
  frame: number | null
  readonly stop: (next: DragState) => void
}

type PointerStart = Pick<ReactPointerEvent, 'pointerId' | 'clientX' | 'clientY'>

type Options = {
  readonly notes: readonly Note[]
  readonly dispatch: Dispatch<BoardAction>
  readonly canvasRef: RefObject<HTMLElement | null>
  readonly trashRef: RefObject<HTMLElement | null>
  readonly snapToGrid: boolean
}

const ARROW_DIRECTIONS: Readonly<Partial<Record<string, Direction>>> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
}

export type NoteInteractions = {
  readonly view: DragView
  readonly onCanvasPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
  readonly onCanvasDoubleClick: (event: ReactMouseEvent<HTMLElement>) => void
  readonly onMoveStart: (noteId: NoteId, event: ReactPointerEvent<HTMLElement>) => void
  readonly onResizeStart: (noteId: NoteId, event: ReactPointerEvent<HTMLElement>) => void
  readonly onKey: (
    noteId: NoteId,
    kind: KeyboardKind,
    event: ReactKeyboardEvent<HTMLElement>,
  ) => void
}

export function useNoteInteractions({
  notes,
  dispatch,
  canvasRef,
  trashRef,
  snapToGrid,
}: Options): NoteInteractions {
  const [gesture, setGesture] = useState<Gesture>(idleGesture)
  const sessionRef = useRef<Session | null>(null)
  // Lets the start handlers stay stable while still finding the note's current rect.
  const notesRef = useRef(notes)
  // Same for the snap setting, so toggling it mid-drag takes effect on the next pointer move.
  const snapRef = useRef(snapToGrid)

  useEffect(() => {
    notesRef.current = notes
  }, [notes])

  useEffect(() => {
    snapRef.current = snapToGrid
  }, [snapToGrid])

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

      const listeners = new AbortController()
      const { signal } = listeners

      function apply({ client, shift }: LatestPointer) {
        session.drag = update(session.drag, toBoardPoint(client), {
          overTrash: isOverTrash(client),
          snapStep: snapStepFor(snapRef.current, shift),
        })
        setGesture({ drag: session.drag, board })
      }

      function stop(next: DragState) {
        if (session.frame !== null) cancelAnimationFrame(session.frame)
        listeners.abort()
        if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId)
        sessionRef.current = null
        setGesture({ drag: next, board })
      }

      // One state update per animation frame, however many pointermoves arrive.
      function onFrame() {
        session.frame = null
        if (session.latestPointer !== null) apply(session.latestPointer)
      }

      function onPointerMove(event: PointerEvent) {
        if (event.pointerId !== pointerId) return
        session.latestPointer = { client: clientPoint(event), shift: event.shiftKey }
        session.frame ??= requestAnimationFrame(onFrame)
      }

      function onPointerUp(event: PointerEvent) {
        if (event.pointerId !== pointerId) return
        // Use the release position, not the last frame's, so the commit matches the pointer.
        const client = clientPoint(event)
        apply({ client, shift: event.shiftKey })
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
        latestPointer: null,
        frame: null,
        stop,
      }
      sessionRef.current = session
      setGesture({ drag: session.drag, board })

      element.addEventListener('pointermove', onPointerMove, { signal })
      element.addEventListener('pointerup', onPointerUp, { signal })
      element.addEventListener('pointercancel', onAbort, { signal })
      element.addEventListener('lostpointercapture', onAbort, { signal })
      window.addEventListener('keydown', onKeyDown, { signal })
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

  const onCanvasDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      // Only the empty canvas creates notes; double-clicks on notes bubble up here too.
      if (event.target !== event.currentTarget || event.button !== 0) return
      const canvasRect = event.currentTarget.getBoundingClientRect()
      dispatch(
        createAtPoint(
          { x: event.clientX - canvasRect.left, y: event.clientY - canvasRect.top },
          {
            board: { width: canvasRect.width, height: canvasRect.height },
            newNoteId: createNoteId,
          },
        ),
      )
    },
    [dispatch],
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

  const onKey = useCallback(
    (noteId: NoteId, kind: KeyboardKind, event: ReactKeyboardEvent<HTMLElement>) => {
      const direction = ARROW_DIRECTIONS[event.key]
      // Leave Alt+Arrow (browser history) and similar shortcuts alone.
      if (direction === undefined || event.altKey || event.ctrlKey || event.metaKey) return
      // Only the handle's own keys; stops the board from scrolling.
      event.preventDefault()
      const canvas = canvasRef.current
      const note = notesRef.current.find((candidate) => candidate.id === noteId)
      if (canvas === null || note === undefined || sessionRef.current !== null) return
      const canvasRect = canvas.getBoundingClientRect()
      const rect = applyKeyboardStep({
        rect: note.rect,
        kind,
        direction,
        shift: event.shiftKey,
        board: { width: canvasRect.width, height: canvasRect.height },
      })
      if (rect === null) return
      const action: BoardAction =
        kind === 'move'
          ? { type: 'noteMoved', id: noteId, rect }
          : { type: 'noteResized', id: noteId, rect }
      dispatch(action)
    },
    [canvasRef, dispatch],
  )

  return {
    view: toDragView(gesture),
    onCanvasPointerDown,
    onCanvasDoubleClick,
    onMoveStart,
    onResizeStart,
    onKey,
  }
}
