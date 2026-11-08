import { useReducer } from 'react'
import './components/App.css'
import { Board } from './components/Board.tsx'
import { createEmptyBoard } from './domain/board.ts'
import { boardReducer } from './domain/boardReducer.ts'

function App() {
  const [board, dispatch] = useReducer(boardReducer, undefined, createEmptyBoard)

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <h1 className="app__title">{board.title}</h1>
          <p className="app__hint">Drag on the board to draw a note, or click to add one.</p>
        </div>
        <div className="app__status" />
      </header>
      <main className="app__main">
        <Board notes={board.notes} dispatch={dispatch} />
      </main>
    </div>
  )
}

export default App
