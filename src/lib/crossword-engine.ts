export interface CellData {
  char: string
  acrossIdx: number | null
  downIdx: number | null
  acrossStart: boolean
  downStart: boolean
}

export interface WordPlacement {
  index: number
  word: string
  clue: string
  row: number
  col: number
  dir: 'across' | 'down'
  position: number
}

export interface CrosswordPuzzle {
  grid: (CellData | null)[][]
  rows: number
  cols: number
  placements: WordPlacement[]
  acrossClues: WordPlacement[]
  downClues: WordPlacement[]
}

const GSIZ = 22

export function buildCrossword(words: string[], clues: string[]): CrosswordPuzzle | null {
  const grid: (CellData | null)[][] = Array.from({ length: GSIZ }, () =>
    new Array(GSIZ).fill(null)
  )
  const charIndex: Record<string, { row: number; col: number }[]> = {}
  const placed: { index: number; word: string; clue: string; row: number; col: number; dir: 'across' | 'down' }[] = []

  function canPlace(word: string, r: number, c: number, dir: 'across' | 'down'): boolean {
    const dr = dir === 'down' ? 1 : 0
    const dc = dir === 'across' ? 1 : 0

    const pr = r - dr, pc = c - dc
    if (pr >= 0 && pc >= 0 && grid[pr][pc] !== null) return false

    const er = r + word.length * dr, ec = c + word.length * dc
    if (er < GSIZ && ec < GSIZ && grid[er][ec] !== null) return false

    let intersections = 0

    for (let i = 0; i < word.length; i++) {
      const cr = r + i * dr, cc = c + i * dc
      if (cr < 0 || cr >= GSIZ || cc < 0 || cc >= GSIZ) return false

      const cell = grid[cr][cc]
      if (cell === null) {
        if (dir === 'across') {
          if (cr > 0 && grid[cr - 1][cc] !== null && grid[cr - 1][cc]!.downIdx === null) return false
          if (cr < GSIZ - 1 && grid[cr + 1][cc] !== null && grid[cr + 1][cc]!.downIdx === null) return false
        } else {
          if (cc > 0 && grid[cr][cc - 1] !== null && grid[cr][cc - 1]!.acrossIdx === null) return false
          if (cc < GSIZ - 1 && grid[cr][cc + 1] !== null && grid[cr][cc + 1]!.acrossIdx === null) return false
        }
      } else {
        if (cell.char !== word[i]) return false
        if (dir === 'across' && cell.acrossIdx !== null) return false
        if (dir === 'down' && cell.downIdx !== null) return false
        intersections++
      }
    }

    return placed.length === 0 || intersections > 0
  }

  function placeWord(word: string, idx: number, r: number, c: number, dir: 'across' | 'down') {
    const dr = dir === 'down' ? 1 : 0
    const dc = dir === 'across' ? 1 : 0
    for (let i = 0; i < word.length; i++) {
      const cr = r + i * dr, cc = c + i * dc
      if (!grid[cr][cc]) {
        grid[cr][cc] = { char: word[i], acrossIdx: null, downIdx: null, acrossStart: false, downStart: false }
        if (!charIndex[word[i]]) charIndex[word[i]] = []
        charIndex[word[i]].push({ row: cr, col: cc })
      }
      if (dir === 'across') {
        grid[cr][cc]!.acrossIdx = idx
        if (i === 0) grid[cr][cc]!.acrossStart = true
      } else {
        grid[cr][cc]!.downIdx = idx
        if (i === 0) grid[cr][cc]!.downStart = true
      }
    }
    placed.push({ index: idx, word, clue: clues[idx] ?? '', row: r, col: c, dir })
  }

  function findPosition(word: string): { r: number; c: number; dir: 'across' | 'down' } | null {
    const candidates: { r: number; c: number; dir: 'across' | 'down'; score: number }[] = []
    for (let wi = 0; wi < word.length; wi++) {
      const ch = word[wi]
      if (!charIndex[ch]) continue
      for (const pos of charIndex[ch]) {
        const ar = pos.row, ac = pos.col - wi
        if (canPlace(word, ar, ac, 'across')) candidates.push({ r: ar, c: ac, dir: 'across', score: wi })
        const dr = pos.row - wi, dc = pos.col
        if (canPlace(word, dr, dc, 'down')) candidates.push({ r: dr, c: dc, dir: 'down', score: wi })
      }
    }
    if (!candidates.length) return null
    return candidates[Math.floor(Math.random() * candidates.length)]
  }

  // Shuffle and place first word in center
  const order = words.map((_, i) => i).sort(() => Math.random() - 0.5)
  const fw = words[order[0]]
  placeWord(fw, order[0], Math.floor(GSIZ / 2), Math.floor(GSIZ / 2) - Math.floor(fw.length / 2), 'across')

  for (let i = 1; i < order.length; i++) {
    const idx = order[i]
    const pos = findPosition(words[idx])
    if (pos) placeWord(words[idx], idx, pos.r, pos.c, pos.dir)
  }

  if (placed.length < 4) return null

  // Minimize grid
  let rMin = GSIZ, rMax = 0, cMin = GSIZ, cMax = 0
  for (let r = 0; r < GSIZ; r++)
    for (let c = 0; c < GSIZ; c++)
      if (grid[r][c]) {
        rMin = Math.min(rMin, r); rMax = Math.max(rMax, r)
        cMin = Math.min(cMin, c); cMax = Math.max(cMax, c)
      }

  const rows = rMax - rMin + 1, cols = cMax - cMin + 1
  const minGrid: (CellData | null)[][] = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      const cell = grid[r + rMin][c + cMin]
      return cell ? { ...cell } : null
    })
  )

  const adjPlaced = placed.map(p => ({ ...p, row: p.row - rMin, col: p.col - cMin }))

  // Assign position numbers
  let posNum = 1
  const posMap = new Map<string, number>()
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const cell = minGrid[r][c]
      if (cell && (cell.acrossStart || cell.downStart))
        posMap.set(`${r},${c}`, posNum++)
    }

  const finalPlacements: WordPlacement[] = adjPlaced.map(p => ({
    ...p,
    position: posMap.get(`${p.row},${p.col}`) ?? 0,
  }))

  const acrossClues = finalPlacements.filter(p => p.dir === 'across').sort((a, b) => a.position - b.position)
  const downClues = finalPlacements.filter(p => p.dir === 'down').sort((a, b) => a.position - b.position)

  return { grid: minGrid, rows, cols, placements: finalPlacements, acrossClues, downClues }
}
