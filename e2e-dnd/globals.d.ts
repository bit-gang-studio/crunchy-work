/** Recorded by the harness so specs can assert what the board reported. */
declare global {
  interface Window {
    __moves?: { cardId: string; toColumnId: string; rank: string }[]
    __opens?: string[]
  }
}

export {}
