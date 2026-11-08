import { useEffect, useReducer, useState } from 'react'
import './components/App.css'
import { Board } from './components/Board.tsx'
import { BoardTitle } from './components/BoardTitle.tsx'
import { StatusBar } from './components/StatusBar.tsx'
import { createEmptyBoard } from './domain/board.ts'
import { boardReducer } from './domain/boardReducer.ts'
import { selectRepository } from './persistence/selectRepository.ts'
import { useBoardPersistence } from './persistence/useBoardPersistence.ts'

function App() {
  const [repository] = useState(() => selectRepository(window.location.search, window.localStorage))
  const [board, dispatch] = useReducer(boardReducer, undefined, createEmptyBoard)
  const { status, loadedBoard, flush } = useBoardPersistence(repository, board)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (loadedBoard === null || ready) return
    dispatch({ type: 'boardLoaded', board: loadedBoard })
    setReady(true)
  }, [loadedBoard, ready])

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__heading">
          <BoardTitle title={board.title} dispatch={dispatch} flush={flush} />
          <p className="app__hint">Drag on the board to draw a note, or click to add one.</p>
        </div>
        <div className="app__status">
          <StatusBar status={status} />
        </div>
      </header>
      <main className="app__main">
        {ready ? <Board notes={board.notes} dispatch={dispatch} /> : <p>Loading…</p>}
      </main>
    </div>
  )
}

export default App
