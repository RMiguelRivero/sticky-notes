import { persistenceConfig } from '../domain/config.ts'
import type { BoardRepository, KeyValueStorage } from './BoardRepository.ts'
import { createLocalStorageRepository } from './localStorageRepository.ts'
import { createMockApiRepository } from './mockApiRepository.ts'
import { createMockServer, sleep } from './mockServer.ts'

export type RepositoryChoice = {
  readonly backend: 'local' | 'api'
  readonly failureRate: number
}

// `?storage=api` picks the mock API; `?fail=0.3` sets its failure rate (clamped to 0..1).
export function parseRepositoryChoice(search: string): RepositoryChoice {
  const params = new URLSearchParams(search)
  const backend = params.get('storage') === 'api' ? 'api' : 'local'

  const rawFail = params.get('fail')
  const fail = rawFail === null || rawFail.trim() === '' ? Number.NaN : Number(rawFail)
  const failureRate = Number.isFinite(fail)
    ? Math.min(1, Math.max(0, fail))
    : persistenceConfig.mockFailureRate

  return { backend, failureRate }
}

export function selectRepository(search: string, storage: KeyValueStorage): BoardRepository {
  const { backend, failureRate } = parseRepositoryChoice(search)
  switch (backend) {
    case 'local':
      return createLocalStorageRepository(storage)
    case 'api':
      return createMockApiRepository(
        createMockServer({
          storage,
          latencyMs: persistenceConfig.mockLatencyMs,
          failureRate,
          random: Math.random,
          delay: sleep,
        }),
      )
  }
}
