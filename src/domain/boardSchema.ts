import { z } from 'zod'
import { type Board, isNoteId, NOTE_COLORS, type Note, type NoteId } from './board.ts'
import { boardConfig, noteConfig } from './config.ts'

export const noteIdSchema = z.custom<NoteId>((v) => typeof v === 'string' && isNoteId(v))

const coordinate = z.number().finite()

const rectSchema = z
  .object({
    x: coordinate,
    y: coordinate,
    width: coordinate.min(noteConfig.minWidth),
    height: coordinate.min(noteConfig.minHeight),
  })
  .readonly()

export const noteSchema = z
  .object({
    id: noteIdSchema,
    rect: rectSchema,
    text: z.string().max(noteConfig.maxTextLength),
    color: z.enum(NOTE_COLORS),
    z: z.number().int().positive(),
  })
  .readonly() satisfies z.ZodType<Note>

export const boardSchema = z
  .object({
    title: z.string().max(boardConfig.maxTitleLength),
    notes: z.array(noteSchema).readonly(),
  })
  .readonly()
  .refine((board) => new Set(board.notes.map((n) => n.id)).size === board.notes.length, {
    message: 'Duplicate note ids',
    path: ['notes'],
  }) satisfies z.ZodType<Board>
