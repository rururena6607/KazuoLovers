import type { MouseEvent } from 'react'
import { COURT_W, MARGIN_X, VIEW_W } from '../../components/courtGeometry.ts'

// 打つ位置（自コートのエンドライン上の x）。左から後衛のゾーン ⑤⑥①。

const H = 12

interface Props {
  x: number | null
  onChange: (x: number) => void
}

export default function EndlinePicker({ x, onChange }: Props) {
  const handleClick = (e: MouseEvent<SVGSVGElement>) => {
    const ctm = e.currentTarget.getScreenCTM()
    if (!ctm) return
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    const cx = (pt.x - MARGIN_X) / COURT_W
    onChange(Math.min(1, Math.max(0, cx)))
  }

  return (
    <svg
      className="endline"
      viewBox={`0 0 ${VIEW_W} ${H}`}
      role="img"
      aria-label="打つ位置（自コートのエンドライン）"
      onClick={handleClick}
    >
      <line x1={MARGIN_X} x2={MARGIN_X + COURT_W} y1={3} y2={3} className="court-line" />
      {['⑤', '⑥', '①'].map((z, i) => (
        <text key={z} x={MARGIN_X + (COURT_W * (i + 0.5)) / 3} y={9} className="endline-num">
          {z}
        </text>
      ))}
      {x !== null && <circle cx={MARGIN_X + x * COURT_W} cy={3} r={2.6} className="court-mark" />}
    </svg>
  )
}
