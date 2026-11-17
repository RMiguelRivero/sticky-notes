export const noteConfig = {
  minWidth: 120,
  minHeight: 120,
  defaultWidth: 200,
  defaultHeight: 200,
  maxTextLength: 2000,
  defaultColor: 'yellow',
} as const

export const boardConfig = {
  defaultTitle: 'Untitled',
  maxTitleLength: 80,
} as const

export const dragConfig = {
  threshold: 4,
} as const

export const keyboardConfig = {
  step: 10,
  shiftStep: 40,
} as const

export const persistenceConfig = {
  debounceMs: 400,
  mockLatencyMs: { min: 300, max: 800 },
  mockFailureRate: 0,
  storageKey: 'sticky-notes:board',
  mockServerKey: 'sticky-notes:mock-server',
  backupSuffix: ':corrupt-backup',
  schemaVersion: 1,
} as const
