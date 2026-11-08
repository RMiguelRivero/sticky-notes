export const noteConfig = {
  minWidth: 120,
  minHeight: 90,
  defaultWidth: 200,
  defaultHeight: 200,
  maxTextLength: 2000,
  defaultColor: 'yellow',
} as const

export const boardConfig = {
  defaultTitle: 'Untitled board',
  maxTitleLength: 80,
} as const

export const dragConfig = {
  threshold: 4,
} as const
