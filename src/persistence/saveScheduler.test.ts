import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Board } from '../domain/board.ts'
import { persistenceConfig } from '../domain/config.ts'
import type { SaveResult } from './BoardRepository.ts'
import { createSaveScheduler, type SaveStatus } from './saveScheduler.ts'

const debounceMs = persistenceConfig.debounceMs

function boardTitled(title: string): Board {
  return { title, notes: [] }
}

type Deferred = {
  readonly board: Board
  readonly finish: (result: SaveResult) => void
}

// A fake save that stays in flight until the test finishes it, and records overlaps.
function setup() {
  const started: Deferred[] = []
  const statuses: SaveStatus[] = []
  let running = 0
  let maxRunning = 0

  const scheduler = createSaveScheduler({
    debounceMs,
    onStatus: (status) => statuses.push(status),
    save: (board) =>
      new Promise<SaveResult>((resolve) => {
        running += 1
        maxRunning = Math.max(maxRunning, running)
        started.push({
          board,
          finish: (result) => {
            running -= 1
            resolve(result)
          },
        })
      }),
  })

  return { scheduler, started, statuses, maxRunning: () => maxRunning }
}

const saved: SaveResult = { kind: 'saved' }

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('save scheduler', () => {
  it('waits for the debounce before saving', async () => {
    const { scheduler, started, statuses } = setup()
    scheduler.schedule(boardTitled('a'))
    expect(statuses).toEqual([{ kind: 'pending' }])

    await vi.advanceTimersByTimeAsync(debounceMs - 1)
    expect(started).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(1)
    expect(started).toHaveLength(1)
    expect(statuses.at(-1)).toEqual({ kind: 'saving' })
  })

  it('restarts the debounce and saves only the latest board', async () => {
    const { scheduler, started } = setup()
    scheduler.schedule(boardTitled('a'))
    await vi.advanceTimersByTimeAsync(debounceMs - 1)
    scheduler.schedule(boardTitled('b'))
    await vi.advanceTimersByTimeAsync(debounceMs - 1)
    expect(started).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(1)
    expect(started.map((s) => s.board.title)).toEqual(['b'])
  })

  it('reports saved when the save succeeds', async () => {
    const { scheduler, started, statuses } = setup()
    scheduler.schedule(boardTitled('a'))
    await vi.advanceTimersByTimeAsync(debounceMs)
    started[0]?.finish(saved)
    await vi.advanceTimersByTimeAsync(0)
    expect(statuses.at(-1)).toEqual({ kind: 'saved' })
  })

  it('merges changes made during a save into one follow-up save', async () => {
    const { scheduler, started, statuses, maxRunning } = setup()
    scheduler.schedule(boardTitled('a'))
    await vi.advanceTimersByTimeAsync(debounceMs)
    expect(started).toHaveLength(1)

    scheduler.schedule(boardTitled('b'))
    scheduler.schedule(boardTitled('c'))
    await vi.advanceTimersByTimeAsync(debounceMs * 2)
    // The debounce fired while the first save was still running: no second save yet.
    expect(started).toHaveLength(1)

    started[0]?.finish(saved)
    await vi.advanceTimersByTimeAsync(0)
    expect(started.map((s) => s.board.title)).toEqual(['a', 'c'])

    started[1]?.finish(saved)
    await vi.advanceTimersByTimeAsync(0)
    expect(statuses.at(-1)).toEqual({ kind: 'saved' })
    expect(started).toHaveLength(2)
    expect(maxRunning()).toBe(1)
  })

  it('lets a still-running debounce start the follow-up save', async () => {
    const { scheduler, started, statuses } = setup()
    scheduler.schedule(boardTitled('a'))
    await vi.advanceTimersByTimeAsync(debounceMs)

    scheduler.schedule(boardTitled('b'))
    started[0]?.finish(saved)
    await vi.advanceTimersByTimeAsync(0)
    expect(statuses.at(-1)).toEqual({ kind: 'pending' })
    expect(started).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(debounceMs)
    expect(started.map((s) => s.board.title)).toEqual(['a', 'b'])
  })

  it('flush starts the pending save immediately', async () => {
    const { scheduler, started } = setup()
    scheduler.schedule(boardTitled('a'))
    scheduler.flush()
    expect(started.map((s) => s.board.title)).toEqual(['a'])

    await vi.advanceTimersByTimeAsync(debounceMs)
    expect(started).toHaveLength(1)
  })

  it('flush does nothing when there is nothing to save', () => {
    const { scheduler, started } = setup()
    scheduler.flush()
    expect(started).toHaveLength(0)
  })

  it('flush during a save waits for it, then saves the latest board', async () => {
    const { scheduler, started, maxRunning } = setup()
    scheduler.schedule(boardTitled('a'))
    scheduler.flush()
    scheduler.schedule(boardTitled('b'))
    scheduler.flush()
    expect(started).toHaveLength(1)

    started[0]?.finish(saved)
    await vi.advanceTimersByTimeAsync(0)
    expect(started.map((s) => s.board.title)).toEqual(['a', 'b'])
    expect(maxRunning()).toBe(1)
  })

  it('reports an error, then tries again on the next change', async () => {
    const { scheduler, started, statuses } = setup()
    scheduler.schedule(boardTitled('a'))
    await vi.advanceTimersByTimeAsync(debounceMs)
    started[0]?.finish({ kind: 'failed', message: 'disk full' })
    await vi.advanceTimersByTimeAsync(0)
    expect(statuses.at(-1)).toEqual({ kind: 'error', message: 'disk full' })

    // No retry timers: nothing happens until the next change.
    await vi.advanceTimersByTimeAsync(debounceMs * 10)
    expect(started).toHaveLength(1)

    scheduler.schedule(boardTitled('b'))
    await vi.advanceTimersByTimeAsync(debounceMs)
    started[1]?.finish(saved)
    await vi.advanceTimersByTimeAsync(0)
    expect(started.map((s) => s.board.title)).toEqual(['a', 'b'])
    expect(statuses.at(-1)).toEqual({ kind: 'saved' })
  })

  it('treats a save that throws as an error and can save again', async () => {
    const statuses: SaveStatus[] = []
    let calls = 0
    const scheduler = createSaveScheduler({
      debounceMs,
      onStatus: (status) => statuses.push(status),
      save: async () => {
        calls += 1
        if (calls === 1) {
          throw new Error('boom')
        }
        return saved
      },
    })
    scheduler.schedule(boardTitled('a'))
    await vi.advanceTimersByTimeAsync(debounceMs)
    expect(statuses.at(-1)).toEqual({ kind: 'error', message: 'boom' })

    scheduler.schedule(boardTitled('b'))
    await vi.advanceTimersByTimeAsync(debounceMs)
    expect(statuses.at(-1)).toEqual({ kind: 'saved' })
  })

  it('the last board always wins, with no overlap, over many changes', async () => {
    const { scheduler, started, maxRunning } = setup()
    for (let i = 0; i < 5; i += 1) {
      scheduler.schedule(boardTitled(`board ${i}`))
      scheduler.flush()
    }
    // Finish saves one by one until none are left.
    for (let guard = 0; guard < 10; guard += 1) {
      const next = started[guard]
      if (next === undefined) {
        break
      }
      next.finish(saved)
      await vi.advanceTimersByTimeAsync(0)
    }
    expect(started.at(-1)?.board.title).toBe('board 4')
    expect(maxRunning()).toBe(1)
  })

  it('dispose cancels the timer and stops all reports', async () => {
    const { scheduler, started, statuses } = setup()
    scheduler.schedule(boardTitled('a'))
    scheduler.dispose()
    const reported = statuses.length
    await vi.advanceTimersByTimeAsync(debounceMs * 2)
    expect(started).toHaveLength(0)

    scheduler.schedule(boardTitled('b'))
    scheduler.flush()
    expect(started).toHaveLength(0)
    expect(statuses).toHaveLength(reported)
  })
})
