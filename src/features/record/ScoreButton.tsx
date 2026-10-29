import { useRef } from 'react'

// 得点の数字。タップで+1、長押しで−1（要件定義書 6 章「得点とサーブ権」）。

const LONG_PRESS_MS = 500

interface Props {
  score: number
  label: string
  serving: boolean
  onPlus: () => void
  onMinus: () => void
}

export default function ScoreButton({ score, label, serving, onPlus, onMinus }: Props) {
  const timer = useRef<number | null>(null)
  /** 長押しで −1 したあとの click は +1 にしない */
  const longPressed = useRef(false)

  const start = () => {
    longPressed.current = false
    timer.current = window.setTimeout(() => {
      longPressed.current = true
      onMinus()
    }, LONG_PRESS_MS)
  }
  const cancel = () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
  }

  return (
    <button
      type="button"
      className="score"
      aria-label={`${label} ${score}点（タップで+1、長押しで−1）`}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (!longPressed.current) onPlus()
      }}
    >
      <span className="score-label">
        {serving && <span className="score-serve" aria-label="サーブ権">●</span>}
        {label}
      </span>
      <span className="score-num num">{score}</span>
    </button>
  )
}
