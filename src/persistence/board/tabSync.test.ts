import { describe, expect, it } from 'vitest'
import type { Board } from '../../domain/board.ts'
import type { LoadResult } from './BoardRepository.ts'
import { createTabSync } from './tabSync.ts'

function boardTitled(title: string): Board {
  return { title, notes: [] }
}

function loaded(title: string): LoadResult {
  return { kind: 'loaded', board: boardTitled(title) }
}

// A fake load that stays pending until the test resolves it, and a switch for canApply.
function setup() {
  const loads: ((result: LoadResult) => void)[] = []
  const applied: string[] = []
  let free = true

  const sync = createTabSync({
    load: () =>
      new Promise<LoadResult>((resolve) => {
        loads.push(resolve)
      }),
    canApply: () => free,
    apply: (board) => applied.push(board.title),
  })

  return {
    sync,
    loads,
    applied,
    setFree: (value: boolean) => {
      free = value
    },
  }
}

// Lets the awaited load result reach the sync logic.
async function settle(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('tab sync', () => {
  it('reloads and applies the board on a ping when it can apply', async () => {
    const { sync, loads, applied } = setup()
    sync.onPing()
    expect(loads).toHaveLength(1)

    loads[0]?.(loaded('remote'))
    await settle()
    expect(applied).toEqual(['remote'])
  })

  it('defers a ping while there are unsaved changes, and reloadIfPingMissed reloads', async () => {
    const { sync, loads, applied, setFree } = setup()
    setFree(false)
    sync.onPing()
    expect(loads).toHaveLength(0)

    setFree(true)
    sync.reloadIfPingMissed()
    expect(loads).toHaveLength(1)
    loads[0]?.(loaded('remote'))
    await settle()
    expect(applied).toEqual(['remote'])

    // The missed ping was used up: calling it again does nothing.
    sync.reloadIfPingMissed()
    expect(loads).toHaveLength(1)
  })

  it('applies only the newer of two overlapping loads, even when they resolve out of order', async () => {
    const { sync, loads, applied } = setup()
    sync.onPing()
    sync.onPing()
    expect(loads).toHaveLength(2)

    loads[1]?.(loaded('newer'))
    await settle()
    loads[0]?.(loaded('older'))
    await settle()
    expect(applied).toEqual(['newer'])
  })

  it('drops a load result when changes appeared during the load, and reloadIfPingMissed reloads', async () => {
    const { sync, loads, applied, setFree } = setup()
    sync.onPing()
    setFree(false)
    loads[0]?.(loaded('remote'))
    await settle()
    expect(applied).toEqual([])

    setFree(true)
    sync.reloadIfPingMissed()
    expect(loads).toHaveLength(2)
    loads[1]?.(loaded('after save'))
    await settle()
    expect(applied).toEqual(['after save'])
  })

  it('ignores empty, corrupt and failed results', async () => {
    const { sync, loads, applied } = setup()
    const results: LoadResult[] = [
      { kind: 'empty' },
      { kind: 'corrupt' },
      { kind: 'failed', message: 'offline' },
    ]
    for (const [index, result] of results.entries()) {
      sync.onPing()
      loads[index]?.(result)
      await settle()
    }
    expect(loads).toHaveLength(3)
    expect(applied).toEqual([])
  })

  it('reloadIfPingMissed does not load without a missed ping', () => {
    const { sync, loads } = setup()
    sync.reloadIfPingMissed()
    expect(loads).toHaveLength(0)
  })
})
