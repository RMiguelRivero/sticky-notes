import { z } from 'zod'

export type Settings = {
  readonly snapToGrid: boolean
}

export const defaultSettings: Settings = { snapToGrid: false }

export const settingsSchema = z
  .object({ snapToGrid: z.boolean() })
  .readonly() satisfies z.ZodType<Settings>
