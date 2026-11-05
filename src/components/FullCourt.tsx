import { useId, type MouseEvent } from 'react'
import type { CourtSide } from '../lib/court/index.ts'
import { CourtLayer } from './Court.tsx'
import {
  FULL_VIEW_H,
  OWN_OFFSET_Y,
  VIEW_W,
  courtToFull,
  eventToSvg,
  fullToCourt,
  type ColSplits,
  type CourtPoint,
} from './courtGeometry.ts'

// 両面のコート図：上が相手コート、下が自コート（記録する側から見た向き）。
// 打った位置 → 方向の矢印（F-20 アタック、F-25 相手のスパイク）を、ネットをまたいで描く。
// タップした点は、どちらのコートの座標か（side）と一緒に返す。

/** 矢印の端。side はその点があるコート */
export interface ArrowEnd {
  side: CourtSide
  p: CourtPoint
}

interface Props {
  label: string
  /** 始点（打った位置）。null なら描かない */
  from: ArrowEnd | null
  /** 終点（方向・落ちた位置）。null なら描かない */
  to: ArrowEnd | null
  onTap?: (end: ArrowEnd) => void
  /** 相手コートの列の境目（F-24）。省略時は 3 等分 */
  colSplits?: ColSplits
}

export default function FullCourt({ label, from, to, onTap, colSplits }: Props) {
  const markerId = useId()
  const handleClick = (e: MouseEvent<SVGSVGElement>) => {
    if (!onTap) return
    const pt = eventToSvg(e)
    if (pt) onTap(fullToCourt(pt))
  }

  const a = from && courtToFull(from.side, from.p)
  const b = to && courtToFull(to.side, to.p)

  return (
    <svg
      className="court court-full"
      viewBox={`0 0 ${VIEW_W} ${FULL_VIEW_H}`}
      role="img"
      aria-label={label}
      onClick={handleClick}
    >
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" className="court-arrow-head" />
        </marker>
      </defs>
      <CourtLayer side="opponent" colSplits={colSplits} />
      <g transform={`translate(0 ${OWN_OFFSET_Y})`}>
        <CourtLayer side="own" />
      </g>
      {a && b && (
        <line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          className="court-arrow"
          markerEnd={`url(#${markerId})`}
        />
      )}
      {a && <circle cx={a.x} cy={a.y} r={2} className="court-arrow-from" />}
      {b && <circle cx={b.x} cy={b.y} r={2.6} className="court-mark" />}
    </svg>
  )
}
