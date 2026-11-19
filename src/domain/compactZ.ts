import type { Board } from './board.ts'

// Renumbers z to 1..n in the same stacking order (ties keep array order); array order is unchanged.
export function compactZ(board: Board): Board {
  const ranked = [...board.notes].sort((a, b) => a.z - b.z)
  const rankById = new Map(ranked.map((note, index) => [note.id, index + 1]))
  return {
    ...board,
    notes: board.notes.map((note) => ({ ...note, z: rankById.get(note.id) ?? note.z })),
  }
}
