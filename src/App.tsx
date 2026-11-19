import { useEffect, useReducer, useState } from 'react'
import './components/App.css'
import { Board } from './components/Board.tsx'
import { BoardTitle } from './components/BoardTitle.tsx'
import { SnapToggle } from './components/SnapToggle.tsx'
import { StatusBar } from './components/StatusBar.tsx'
import { createEmptyBoard } from './domain/board.ts'
import { boardReducer } from './domain/boardReducer.ts'
import { selectRepository } from './persistence/board/selectRepository.ts'
import { useBoardPersistence } from './persistence/board/useBoardPersistence.ts'
import { createLocalStorageSettingsRepository } from './persistence/settings/localStorageSettingsRepository.ts'
import { useSettings } from './persistence/settings/useSettings.ts'

function App() {
  const [repository] = useState(() => selectRepository(window.location.search, window.localStorage))
  const [settingsRepository] = useState(() =>
    createLocalStorageSettingsRepository(window.localStorage),
  )
  const { settings, setSnapToGrid } = useSettings(settingsRepository)
  const [board, dispatch] = useReducer(boardReducer, undefined, createEmptyBoard)
  const { status, loadedBoard, flush } = useBoardPersistence(repository, board)
  const ready = loadedBoard !== null

  // Every loaded board, the first one and each one reloaded after another tab saved.
  useEffect(() => {
    if (loadedBoard === null) return
    dispatch({ type: 'boardLoaded', board: loadedBoard })
  }, [loadedBoard])

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__heading">
          <BoardTitle title={board.title} dispatch={dispatch} flush={flush} />
          <p className="app__hint">Drag on the board to draw a note, or double-click to add one.</p>
        </div>
        <div className="app__side">
          <div className="app__status">
            <StatusBar status={status} />
          </div>
          <SnapToggle checked={settings.snapToGrid} onChange={setSnapToGrid} />
        </div>
      </header>
      <main className="app__main">
        {ready ? (
          <Board notes={board.notes} dispatch={dispatch} snapToGrid={settings.snapToGrid} />
        ) : (
          <p>Loading…</p>
        )}
      </main>
    </div>
  )
}

export default App
