/** Recorded by the harness so specs can assert what the board reported. */
declare global {
  interface Window {
    __moves?: { cardId: string; toColumnId: string; rank: string }[]
    __columnMoves?: { columnId: string; index: number }[]
    __opens?: string[]
  }
}

export {}
