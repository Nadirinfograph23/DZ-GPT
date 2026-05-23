import { useState, useEffect, useCallback, useRef } from 'react'
import { buildCrossword, CrosswordPuzzle, WordPlacement } from '../lib/crossword-engine'
import '../styles/dz-crossword.css'

const WORDS = [
  'كتاب', 'شمال', 'جمال', 'قمر', 'علم', 'بحر', 'نور', 'وطن',
  'باب', 'رمل', 'ليل', 'صبح', 'ملح', 'ماء', 'نار', 'قلم',
  'سلام', 'كريم', 'رياح', 'طريق', 'حياة', 'شجرة',
]

const CLUES: Record<string, string> = {
  'كتاب': 'مصدر العلم والمعرفة',
  'شمال': 'اتجاه القطب الشمالي',
  'جمال': 'ضد القبح',
  'قمر': 'يضيء الليل',
  'علم': 'رمز الوطن',
  'بحر': 'ماء ملح واسع',
  'نور': 'يزيل الظلام',
  'وطن': 'الأرض التي تنتمي إليها',
  'باب': 'مدخل البيت',
  'رمل': 'ما تجده في الصحراء',
  'ليل': 'وقت الظلام',
  'صبح': 'أول النهار',
  'ملح': 'يُضاف للطعام',
  'ماء': 'شراب الحياة',
  'نار': 'حرارة ولهب',
  'قلم': 'أداة الكتابة',
  'سلام': 'تحية السلم والمحبة',
  'كريم': 'صفة الشخص المعطاء',
  'رياح': 'هواء متحرك',
  'طريق': 'مسار للسير',
  'حياة': 'ضد الموت',
  'شجرة': 'نبات له جذع وأفرع',
}

const ARABIC_KB = [
  ['ض', 'ص', 'ث', 'ق', 'ف', 'غ', 'ع', 'ه', 'خ', 'ح', 'ج'],
  ['ش', 'س', 'ي', 'ب', 'ل', 'ا', 'ت', 'ن', 'م', 'ك'],
  ['ئ', 'ء', 'ؤ', 'ر', 'ى', 'ة', 'و', 'ز', 'ظ', 'ط'],
]

function makeNewPuzzle(): CrosswordPuzzle | null {
  const pool = [...WORDS].sort(() => Math.random() - 0.5).slice(0, 14)
  const clues = pool.map(w => CLUES[w] ?? w)
  for (let attempt = 0; attempt < 8; attempt++) {
    const result = buildCrossword(pool, clues)
    if (result && result.placements.length >= 4) return result
  }
  return null
}

type CellState = 'empty' | 'selected' | 'highlight' | 'correct' | 'wrong'

export default function DZCrossword() {
  const [puzzle, setPuzzle] = useState<CrosswordPuzzle | null>(null)
  const [userInput, setUserInput] = useState<string[][]>([])
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null)
  const [selDir, setSelDir] = useState<'across' | 'down'>('across')
  const [checked, setChecked] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [won, setWon] = useState(false)
  const [loading, setLoading] = useState(true)
  const gridRef = useRef<HTMLDivElement>(null)

  const initPuzzle = useCallback(() => {
    setLoading(true)
    setChecked(false)
    setRevealed(false)
    setWon(false)
    setSelected(null)
    setTimeout(() => {
      const p = makeNewPuzzle()
      setPuzzle(p)
      if (p) {
        setUserInput(Array.from({ length: p.rows }, () => new Array(p.cols).fill('')))
      }
      setLoading(false)
    }, 50)
  }, [])

  useEffect(() => { initPuzzle() }, [initPuzzle])

  // Find which word covers the selected cell in the given direction
  const getWordAt = useCallback((r: number, c: number, dir: 'across' | 'down', p: CrosswordPuzzle): WordPlacement | null => {
    return p.placements.find(pl => {
      if (pl.dir !== dir) return false
      const dr = dir === 'down' ? 1 : 0
      const dc = dir === 'across' ? 1 : 0
      for (let i = 0; i < pl.word.length; i++) {
        if (pl.row + i * dr === r && pl.col + i * dc === c) return true
      }
      return false
    }) ?? null
  }, [])

  // Get cells covered by a word placement
  const getWordCells = useCallback((pl: WordPlacement) => {
    const cells: { r: number; c: number }[] = []
    const dr = pl.dir === 'down' ? 1 : 0
    const dc = pl.dir === 'across' ? 1 : 0
    for (let i = 0; i < pl.word.length; i++)
      cells.push({ r: pl.row + i * dr, c: pl.col + i * dc })
    return cells
  }, [])

  // Move to next cell in word after input
  const moveNext = useCallback((r: number, c: number, dir: 'across' | 'down', p: CrosswordPuzzle) => {
    const dr = dir === 'down' ? 1 : 0
    const dc = dir === 'across' ? 1 : 0
    const nr = r + dr, nc = c + dc
    if (nr >= 0 && nr < p.rows && nc >= 0 && nc < p.cols && p.grid[nr][nc] !== null) {
      setSelected({ r: nr, c: nc })
    }
  }, [])

  const movePrev = useCallback((r: number, c: number, dir: 'across' | 'down', p: CrosswordPuzzle) => {
    const dr = dir === 'down' ? 1 : 0
    const dc = dir === 'across' ? 1 : 0
    const nr = r - dr, nc = c - dc
    if (nr >= 0 && nr < p.rows && nc >= 0 && nc < p.cols && p.grid[nr][nc] !== null) {
      setSelected({ r: nr, c: nc })
    }
  }, [])

  const handleCellClick = useCallback((r: number, c: number) => {
    if (!puzzle) return
    if (selected && selected.r === r && selected.c === c) {
      // Toggle direction
      const cell = puzzle.grid[r][c]!
      const hasAcross = cell.acrossIdx !== null
      const hasDown = cell.downIdx !== null
      if (hasAcross && hasDown) {
        setSelDir(d => d === 'across' ? 'down' : 'across')
      }
    } else {
      setSelected({ r, c })
      // Auto-pick best direction
      const cell = puzzle.grid[r][c]!
      if (cell.acrossIdx === null && cell.downIdx !== null) setSelDir('down')
      else if (cell.downIdx === null && cell.acrossIdx !== null) setSelDir('across')
    }
    setChecked(false)
  }, [puzzle, selected])

  const handleKey = useCallback((key: string) => {
    if (!puzzle || !selected || won || revealed) return
    const { r, c } = selected
    const arabic = /[\u0600-\u06FF]/
    if (arabic.test(key) && key.length === 1) {
      setUserInput(prev => {
        const next = prev.map(row => [...row])
        next[r][c] = key
        return next
      })
      moveNext(r, c, selDir, puzzle)
      setChecked(false)
    } else if (key === 'Backspace' || key === 'DEL') {
      if (userInput[r]?.[c]) {
        setUserInput(prev => {
          const next = prev.map(row => [...row])
          next[r][c] = ''
          return next
        })
      } else {
        movePrev(r, c, selDir, puzzle)
      }
      setChecked(false)
    } else if (key === 'ArrowRight' || key === 'ArrowLeft' || key === 'ArrowUp' || key === 'ArrowDown') {
      const moves: Record<string, [number, number]> = {
        ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowUp: [-1, 0], ArrowDown: [1, 0],
      }
      const [dr, dc] = moves[key]
      const nr = r + dr, nc = c + dc
      if (nr >= 0 && nr < puzzle.rows && nc >= 0 && nc < puzzle.cols && puzzle.grid[nr][nc] !== null) {
        setSelected({ r: nr, c: nc })
      }
    }
  }, [puzzle, selected, selDir, userInput, won, revealed, moveNext, movePrev])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!selected) return
      handleKey(e.key)
      if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key)) e.preventDefault()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleKey, selected])

  const checkAnswers = useCallback(() => {
    if (!puzzle) return
    setChecked(true)
    // Check if fully correct
    const allCorrect = puzzle.placements.every(pl => {
      const dr = pl.dir === 'down' ? 1 : 0
      const dc = pl.dir === 'across' ? 1 : 0
      return pl.word.split('').every((ch, i) =>
        userInput[pl.row + i * dr]?.[pl.col + i * dc] === ch
      )
    })
    if (allCorrect) setWon(true)
  }, [puzzle, userInput])

  const revealAll = useCallback(() => {
    if (!puzzle) return
    setRevealed(true)
    setChecked(false)
    setUserInput(Array.from({ length: puzzle.rows }, (_, r) =>
      Array.from({ length: puzzle.cols }, (_, c) => puzzle.grid[r][c]?.char ?? '')
    ))
  }, [puzzle])

  const getCellState = useCallback((r: number, c: number): CellState => {
    if (!puzzle || !puzzle.grid[r][c]) return 'empty'
    if (selected && selected.r === r && selected.c === c) return 'selected'
    if (selected && puzzle) {
      const word = getWordAt(selected.r, selected.c, selDir, puzzle)
      if (word) {
        const cells = getWordCells(word)
        if (cells.some(cell => cell.r === r && cell.c === c)) return 'highlight'
      }
    }
    if (checked || revealed) {
      const cell = puzzle.grid[r][c]!
      const userChar = userInput[r]?.[c]
      if (!userChar) return 'empty'
      return userChar === cell.char ? 'correct' : 'wrong'
    }
    return 'empty'
  }, [puzzle, selected, selDir, checked, revealed, userInput, getWordAt, getWordCells])

  const handleClueClick = useCallback((pl: WordPlacement) => {
    setSelected({ r: pl.row, c: pl.col })
    setSelDir(pl.dir)
    setChecked(false)
    gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [])

  if (loading) {
    return (
      <div className="cw-loading">
        <div className="cw-spinner" />
        <div className="cw-loading-text">جاري توليد اللغز...</div>
      </div>
    )
  }

  if (!puzzle) {
    return (
      <div className="cw-loading">
        <div className="cw-loading-text">تعذّر توليد اللغز</div>
        <button className="cw-btn" onClick={initPuzzle}>حاول مجدداً</button>
      </div>
    )
  }

  const activeWord = selected ? getWordAt(selected.r, selected.c, selDir, puzzle) : null

  return (
    <div className="cw-root" dir="rtl">
      {won && (
        <div className="cw-won-banner">🎉 مبروك! حللت الوصلة!</div>
      )}

      {/* Active clue hint */}
      {activeWord && (
        <div className="cw-active-clue">
          <span className="cw-active-clue-pos">{activeWord.position} {activeWord.dir === 'across' ? 'أفقي ←' : 'عمودي ↓'}</span>
          <span className="cw-active-clue-text">{activeWord.clue}</span>
        </div>
      )}

      {/* Grid */}
      <div className="cw-grid-wrap" ref={gridRef}>
        <div
          className="cw-grid"
          style={{ gridTemplateColumns: `repeat(${puzzle.cols}, 1fr)` }}
        >
          {Array.from({ length: puzzle.rows }, (_, r) =>
            Array.from({ length: puzzle.cols }, (_, c) => {
              const cell = puzzle.grid[r][c]
              if (!cell) {
                return <div key={`${r}-${c}`} className="cw-cell cw-cell--black" />
              }
              const state = getCellState(r, c)
              const posNum = puzzle.placements.find(p => p.row === r && p.col === c)?.position
              const userChar = userInput[r]?.[c] ?? ''

              return (
                <div
                  key={`${r}-${c}`}
                  className={`cw-cell cw-cell--${state}`}
                  onClick={() => handleCellClick(r, c)}
                >
                  {posNum && <span className="cw-cell-num">{posNum}</span>}
                  <span className="cw-cell-letter">{userChar}</span>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Buttons */}
      <div className="cw-actions">
        <button className="cw-btn cw-btn--check" onClick={checkAnswers} disabled={revealed || won}>
          تحقق ✔
        </button>
        <button className="cw-btn cw-btn--reveal" onClick={revealAll} disabled={revealed || won}>
          اكشف الحل 👁
        </button>
        <button className="cw-btn cw-btn--new" onClick={initPuzzle}>
          لغز جديد 🔄
        </button>
      </div>

      {/* Clues */}
      <div className="cw-clues">
        <div className="cw-clues-col">
          <div className="cw-clues-title">← أفقي</div>
          {puzzle.acrossClues.map(cl => (
            <div
              key={`a-${cl.position}`}
              className={`cw-clue-item${activeWord === cl ? ' cw-clue-item--active' : ''}`}
              onClick={() => handleClueClick(cl)}
            >
              <span className="cw-clue-num">{cl.position}</span>
              <span className="cw-clue-text">{cl.clue}</span>
            </div>
          ))}
        </div>
        <div className="cw-clues-col">
          <div className="cw-clues-title">↓ عمودي</div>
          {puzzle.downClues.map(cl => (
            <div
              key={`d-${cl.position}`}
              className={`cw-clue-item${activeWord === cl ? ' cw-clue-item--active' : ''}`}
              onClick={() => handleClueClick(cl)}
            >
              <span className="cw-clue-num">{cl.position}</span>
              <span className="cw-clue-text">{cl.clue}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Arabic keyboard for mobile */}
      <div className="cw-keyboard">
        {ARABIC_KB.map((row, ri) => (
          <div key={ri} className="cw-kb-row">
            {ri === 2 && (
              <button className="cw-kb-key cw-kb-key--del" onClick={() => handleKey('DEL')}>⌫</button>
            )}
            {row.map(key => (
              <button key={key} className="cw-kb-key" onClick={() => handleKey(key)}>{key}</button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
