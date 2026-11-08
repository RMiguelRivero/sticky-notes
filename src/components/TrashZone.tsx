import type { RefObject } from 'react'
import './TrashZone.css'

type Props = {
  readonly ref: RefObject<HTMLElement | null>
  // A note is being moved: the zone shows where it can be dropped.
  readonly armed: boolean
  readonly pointerOver: boolean
}

function TrashIcon({ open }: { readonly open: boolean }) {
  return (
    <svg
      className="trash__icon"
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 8h14l-1 12H6L5 8z" />
      <path d="M10 12v5M14 12v5" />
      {open ? <path d="M4 5l15-3" /> : <path d="M4 5h16M9 5V3h6v2" />}
    </svg>
  )
}

export function TrashZone({ ref, armed, pointerOver }: Props) {
  return (
    <section
      ref={ref}
      className="trash"
      aria-label="Trash"
      data-armed={armed ? 'true' : undefined}
      data-over={pointerOver ? 'true' : undefined}
    >
      <TrashIcon open={pointerOver} />
      <span>{pointerOver ? 'Release to delete' : 'Drag a note here to delete it'}</span>
    </section>
  )
}
