import type { Dispatch } from 'react'
import type { BoardAction } from '../domain/boardReducer.ts'
import { boardConfig } from '../domain/config.ts'
import './BoardTitle.css'

type Props = {
  readonly title: string
  readonly dispatch: Dispatch<BoardAction>
  readonly flush: () => void
}

export function BoardTitle({ title, dispatch, flush }: Props) {
  return (
    <h1 className="board-title">
      <input
        type="text"
        className="board-title__input"
        aria-label="Board title"
        placeholder={boardConfig.defaultTitle}
        maxLength={boardConfig.maxTitleLength}
        value={title}
        onChange={(event) => dispatch({ type: 'titleChanged', title: event.target.value })}
        onBlur={() => {
          const trimmed = title.trim()
          if (trimmed !== title) {
            dispatch({ type: 'titleChanged', title: trimmed })
          }
          flush()
        }}
      />
    </h1>
  )
}
