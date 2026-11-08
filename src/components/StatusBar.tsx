import type { SaveStatus } from '../persistence/saveScheduler.ts'
import type { PersistenceStatus } from '../persistence/useBoardPersistence.ts'
import { assertNever } from '../utils/assertNever.ts'
import './StatusBar.css'

type Props = {
  readonly status: PersistenceStatus
}

type StatusText = { readonly text: string; readonly isError: boolean }

const EMPTY: StatusText = { text: '', isError: false }

function saveText(save: SaveStatus): StatusText {
  switch (save.kind) {
    case 'idle':
      return EMPTY
    case 'pending':
    case 'saving':
      return { text: 'Saving…', isError: false }
    case 'saved':
      return { text: 'All changes saved', isError: false }
    case 'error':
      return { text: `Couldn't save: ${save.message}`, isError: true }
    default:
      return assertNever(save)
  }
}

function statusText(status: PersistenceStatus): StatusText {
  switch (status.kind) {
    case 'loading':
      return { text: 'Loading…', isError: false }
    case 'ready':
      return saveText(status.save)
    case 'error': {
      // A failed load must stay visible: a later "saved" would wrongly suggest the data is safe.
      const save = saveText(status.save)
      return save.isError ? save : { text: status.message, isError: true }
    }
    default:
      return assertNever(status)
  }
}

// This element is the app's single live region; note announcements can reuse it later.
export function StatusBar({ status }: Props) {
  const { text, isError } = statusText(status)
  return (
    <p role="status" className="status-bar" data-error={isError ? 'true' : undefined}>
      {text}
    </p>
  )
}
