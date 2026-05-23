import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import '../styles/dz-le3ba.css'

const WORD_LENGTH = 4
const MAX_TRIES = 6

const WORD_BANK = [
  'بيان', 'كتاب', 'شمال', 'يمين', 'قلوب', 'رسول', 'كمال', 'جمال',
  'سلام', 'عيون', 'ديار', 'غيوم', 'صباح', 'نهار', 'بلاد', 'نزول',
  'جبال', 'أنوار', 'وطان', 'بيوت', 'ليال', 'سهام', 'رمال', 'كلام',
  'حياة', 'صداق', 'وفاء', 'أمال', 'لغات', 'علوم', 'فكار', 'حلوم',
]

const ARABIC_KEYBOARD = [
  ['ض', 'ص', 'ث', 'ق', 'ف', 'غ', 'ع', 'ه', 'خ', 'ح', 'ج'],
  ['ش', 'س', 'ي', 'ب', 'ل', 'ا', 'ت', 'ن', 'م', 'ك'],
  ['ئ', 'ء', 'ؤ', 'ر', 'ى', 'ة', 'و', 'ز', 'ظ', 'ط'],
]

function pickWord() {
  return WORD_BANK[Math.floor(Math.random() * WORD_BANK.length)]
}

type TileState = 'correct' | 'present' | 'absent' | 'empty' | 'active'

interface Tile {
  letter: string
  state: TileState
}

export default function DZLe3ba() {
  const navigate = useNavigate()
  const [target, setTarget] = useState(pickWord)
  const [guesses, setGuesses] = useState<Tile[][]>([])
  const [current, setCurrent] = useState('')
  const [gameOver, setGameOver] = useState<'win' | 'lose' | null>(null)
  const [shake, setShake] = useState(false)
  const [reveal, setReveal] = useState<number | null>(null)
  const [usedKeys, setUsedKeys] = useState<Record<string, TileState>>({})
  const [stats, setStats] = useState({ played: 0, wins: 0, streak: 0 })
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const saved = localStorage.getItem('dz-le3ba-stats')
    if (saved) setStats(JSON.parse(saved))
  }, [])

  const saveStats = useCallback((won: boolean) => {
    setStats(prev => {
      const next = {
        played: prev.played + 1,
        wins: prev.wins + (won ? 1 : 0),
        streak: won ? prev.streak + 1 : 0,
      }
      localStorage.setItem('dz-le3ba-stats', JSON.stringify(next))
      return next
    })
  }, [])

  const evaluateGuess = useCallback((guess: string, tgt: string): Tile[] => {
    const tgtArr = [...tgt]
    const result: Tile[] = Array.from(guess).map(letter => ({ letter, state: 'absent' as TileState }))
    const used = new Array(WORD_LENGTH).fill(false)

    result.forEach((tile, i) => {
      if (tile.letter === tgtArr[i]) {
        tile.state = 'correct'
        used[i] = true
      }
    })

    result.forEach((tile, i) => {
      if (tile.state === 'correct') return
      const j = tgtArr.findIndex((l, idx) => l === tile.letter && !used[idx])
      if (j !== -1) {
        tile.state = 'present'
        used[j] = true
      }
    })

    return result
  }, [])

  const submitGuess = useCallback(() => {
    const letters = [...current]
    if (letters.length !== WORD_LENGTH) {
      setShake(true)
      setTimeout(() => setShake(false), 500)
      return
    }

    const tiles = evaluateGuess(current, target)
    const newGuesses = [...guesses, tiles]
    setGuesses(newGuesses)
    setCurrent('')

    setReveal(newGuesses.length - 1)
    setTimeout(() => setReveal(null), WORD_LENGTH * 150 + 300)

    const newKeys = { ...usedKeys }
    tiles.forEach(t => {
      const prev = newKeys[t.letter]
      if (prev === 'correct') return
      if (prev === 'present' && t.state === 'absent') return
      newKeys[t.letter] = t.state
    })
    setUsedKeys(newKeys)

    const won = tiles.every(t => t.state === 'correct')
    if (won) {
      setTimeout(() => { setGameOver('win'); saveStats(true) }, WORD_LENGTH * 150 + 400)
    } else if (newGuesses.length >= MAX_TRIES) {
      setTimeout(() => { setGameOver('lose'); saveStats(false) }, WORD_LENGTH * 150 + 400)
    }
  }, [current, guesses, target, evaluateGuess, usedKeys, saveStats])

  const pressKey = useCallback((key: string) => {
    if (gameOver) return
    if (key === 'DEL') {
      setCurrent(p => [...p].slice(0, -1).join(''))
    } else if (key === 'ENTER') {
      submitGuess()
    } else if ([...current].length < WORD_LENGTH) {
      setCurrent(p => p + key)
    }
  }, [gameOver, current, submitGuess])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (gameOver) return
      if (e.key === 'Backspace') { pressKey('DEL'); return }
      if (e.key === 'Enter') { pressKey('ENTER'); return }
      const arabic = /[\u0600-\u06FF]/
      if (arabic.test(e.key) && e.key.length === 1) pressKey(e.key)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [pressKey, gameOver])

  const resetGame = () => {
    setTarget(pickWord())
    setGuesses([])
    setCurrent('')
    setGameOver(null)
    setUsedKeys({})
    setReveal(null)
  }

  const currentLetters = [...current]
  const remainingRows = MAX_TRIES - guesses.length - (gameOver ? 0 : 1)

  return (
    <div className="le3ba-root" dir="rtl">
      <header className="le3ba-header">
        <button className="le3ba-back" onClick={() => navigate('/')} aria-label="عودة">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div className="le3ba-logo">
          <span className="le3ba-logo-dz">DZ</span>
          <span className="le3ba-logo-le">LE3BA</span>
        </div>
        <div className="le3ba-stats-mini">
          <span>🏆 {stats.wins}</span>
          <span>🔥 {stats.streak}</span>
        </div>
      </header>

      <div className="le3ba-subtitle">خمّن الكلمة العربية في {MAX_TRIES} محاولات</div>

      <div className="le3ba-board">
        {guesses.map((row, ri) => (
          <div key={ri} className={`le3ba-row${reveal === ri ? ' le3ba-row--reveal' : ''}`}>
            {row.map((tile, ci) => (
              <div
                key={ci}
                className={`le3ba-tile le3ba-tile--${tile.state}`}
                style={reveal === ri ? { animationDelay: `${ci * 150}ms` } : {}}
              >
                {tile.letter}
              </div>
            ))}
          </div>
        ))}

        {!gameOver && guesses.length < MAX_TRIES && (
          <div className={`le3ba-row le3ba-row--active${shake ? ' le3ba-row--shake' : ''}`}>
            {Array.from({ length: WORD_LENGTH }, (_, i) => (
              <div key={i} className={`le3ba-tile le3ba-tile--${currentLetters[i] ? 'active' : 'empty'}`}>
                {currentLetters[i] || ''}
              </div>
            ))}
          </div>
        )}

        {Array.from({ length: Math.max(0, remainingRows) }, (_, i) => (
          <div key={`empty-${i}`} className="le3ba-row">
            {Array.from({ length: WORD_LENGTH }, (_, j) => (
              <div key={j} className="le3ba-tile le3ba-tile--empty" />
            ))}
          </div>
        ))}
      </div>

      {gameOver && (
        <div className="le3ba-result">
          {gameOver === 'win' ? (
            <div className="le3ba-result-win">
              <div className="le3ba-result-emoji">🎉</div>
              <div className="le3ba-result-title">برافو عليك!</div>
              <div className="le3ba-result-sub">في {guesses.length} محاولة</div>
            </div>
          ) : (
            <div className="le3ba-result-lose">
              <div className="le3ba-result-emoji">😔</div>
              <div className="le3ba-result-title">الكلمة كانت</div>
              <div className="le3ba-result-word">{target}</div>
            </div>
          )}
          <button className="le3ba-replay-btn" onClick={resetGame}>العب مجدداً 🔄</button>
        </div>
      )}

      <div className="le3ba-keyboard">
        {ARABIC_KEYBOARD.map((row, ri) => (
          <div key={ri} className="le3ba-kb-row">
            {ri === 2 && (
              <button className="le3ba-kb-key le3ba-kb-key--action" onClick={() => pressKey('ENTER')}>
                ✔
              </button>
            )}
            {row.map(key => (
              <button
                key={key}
                className={`le3ba-kb-key${usedKeys[key] ? ` le3ba-kb-key--${usedKeys[key]}` : ''}`}
                onClick={() => pressKey(key)}
              >
                {key}
              </button>
            ))}
            {ri === 2 && (
              <button className="le3ba-kb-key le3ba-kb-key--action" onClick={() => pressKey('DEL')}>
                ⌫
              </button>
            )}
          </div>
        ))}
      </div>

      <input
        ref={inputRef}
        className="le3ba-hidden-input"
        type="text"
        aria-hidden="true"
        tabIndex={-1}
        readOnly
      />
    </div>
  )
}
