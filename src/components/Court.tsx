import type { MouseEvent } from 'react'
import { ATTACK_LINE_Y } from '../contracts/index.ts'
import { type CourtSide, zoneBounds, zoneCenter } from '../lib/court/index.ts'
import {
  COURT_H,
  COURT_W,
  MARGIN_X,
  MARGIN_Y,
  VIEW_H,
  VIEW_W,
  courtToSvg,
  svgToCourt,
  type CourtPoint,
} from './courtGeometry.ts'

// ゾーン番号つきのコート図（要件定義書 6 章「ゾーン番号を常に表示」）。
// 相手コートはネットが下、自コートはネットが上。周りの余白はアウトとしてタップできる。

const ZONE_LABEL = ['', '①', '②', '③', '④', '⑤', '⑥']

interface Props {
  side: CourtSide
  /** 印を付ける点（着弾点など） */
  marks?: readonly CourtPoint[]
  /** 塗るゾーン（練習モードの狙ったゾーン） */
  highlightZone?: number | null
  onTap?: (p: CourtPoint) => void
  label: string
}

export default function Court({ side, marks = [], highlightZone = null, onTap, label }: Props) {
  const handleClick = (e: MouseEvent<SVGSVGElement>) => {
    if (!onTap) return
    // 画面上の位置 → viewBox の座標
    const ctm = e.currentTarget.getScreenCTM()
    if (!ctm) return
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    onTap(svgToCourt(side, { x: pt.x, y: pt.y }))
  }

  const netY = side === 'opponent' ? MARGIN_Y + COURT_H : MARGIN_Y
  const attackY = courtToSvg(side, { x: 0, y: ATTACK_LINE_Y }).y

  return (
    <svg
      className="court"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      role="img"
      aria-label={label}
      onClick={handleClick}
    >
      <rect x={MARGIN_X} y={MARGIN_Y} width={COURT_W} height={COURT_H} className="court-floor" />
      {highlightZone !== null &&
        (() => {
          const b = zoneBounds(side, highlightZone)
          if (!b) return null
          const a = courtToSvg(side, { x: b.x0, y: b.y0 })
          const c = courtToSvg(side, { x: b.x1, y: b.y1 })
          return (
            <rect
              x={Math.min(a.x, c.x)}
              y={Math.min(a.y, c.y)}
              width={Math.abs(c.x - a.x)}
              height={Math.abs(c.y - a.y)}
              className="court-highlight"
            />
          )
        })()}
      {[1, 2].map((i) => (
        <line
          key={i}
          x1={MARGIN_X + (COURT_W * i) / 3}
          x2={MARGIN_X + (COURT_W * i) / 3}
          y1={MARGIN_Y}
          y2={MARGIN_Y + COURT_H}
          className="court-zone-line"
        />
      ))}
      <line x1={MARGIN_X} x2={MARGIN_X + COURT_W} y1={attackY} y2={attackY} className="court-line" />
      {[1, 2, 3, 4, 5, 6].map((z) => {
        const c = zoneCenter(side, z)
        if (!c) return null
        const p = courtToSvg(side, c)
        return (
          <text key={z} x={p.x} y={p.y} className="court-zone-num">
            {ZONE_LABEL[z]}
          </text>
        )
      })}
      <rect
        x={MARGIN_X}
        y={MARGIN_Y}
        width={COURT_W}
        height={COURT_H}
        className="court-line court-outline"
      />
      <line x1={0} x2={VIEW_W} y1={netY} y2={netY} className="court-net" />
      {marks.map((m, i) => {
        const p = courtToSvg(side, m)
        return <circle key={i} cx={p.x} cy={p.y} r={2.6} className="court-mark" />
      })}
    </svg>
  )
}
