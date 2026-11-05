import { useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { ATTACK_LINE_Y, DEFAULT_COL_SPLITS } from '../contracts/index.ts'
import { type CourtSide, zoneBounds, zoneCenter } from '../lib/court/index.ts'
import {
  COURT_H,
  zoneColor,
  COURT_W,
  MARGIN_X,
  MARGIN_Y,
  VIEW_H,
  VIEW_W,
  allZones,
  courtToSvg,
  eventToSvg,
  moveColSplit,
  svgToCourt,
  zoneLabel,
  type ColSplits,
  type CourtPoint,
} from './courtGeometry.ts'

// ゾーン番号つきのコート図（要件定義書 6 章「ゾーン番号を常に表示」）。
// 相手コートはネットが下、自コートはネットが上。周りの余白はアウトとしてタップできる。

/** 印。color と label があれば選手の色の点に背番号を書く（F-22）。なければ入力中の黒い点 */
export interface CourtMark extends CourtPoint {
  color?: string
  label?: string
}

interface Props {
  side: CourtSide
  /** 印を付ける点（着弾点など）。あとのものほど上に描く */
  marks?: readonly CourtMark[]
  /** 塗るゾーン（練習モードの狙ったゾーン） */
  highlightZone?: number | null
  onTap?: (p: CourtPoint) => void
  label: string
  /** 相手コートの列の境目（F-24）。省略時は 3 等分 */
  colSplits?: ColSplits
  /** あれば相手コートの点線をドラッグで動かせる（F-24） */
  onColSplitsChange?: (splits: ColSplits) => void
  /** 点線を離したとき（保存はここで1回だけ） */
  onColSplitsCommit?: (splits: ColSplits) => void
}

export default function Court({
  side,
  marks = [],
  highlightZone = null,
  onTap,
  label,
  colSplits = DEFAULT_COL_SPLITS,
  onColSplitsChange,
  onColSplitsCommit,
}: Props) {
  /** つかんでいる点線（0＝左、1＝右）。null はつかんでいない */
  const [dragging, setDragging] = useState<0 | 1 | null>(null)
  /** ドラッグを離したときのクリックで、着弾点を置かないようにする */
  const justDragged = useRef(false)
  const canDrag = side === 'opponent' && onColSplitsChange !== undefined

  const handleClick = (e: MouseEvent<SVGSVGElement>) => {
    if (justDragged.current) {
      justDragged.current = false
      return
    }
    if (!onTap) return
    const pt = eventToSvg(e)
    if (pt) onTap(svgToCourt(side, pt))
  }

  /**
   * ドラッグ中の最新の境目。props の colSplits は再描画のあとでしか新しくならないので、
   * すばやく離しても最後の位置を保存できるよう、ここに持つ
   */
  const latest = useRef<ColSplits>(colSplits)

  const grab = (index: 0 | 1) => (e: PointerEvent<SVGLineElement>) => {
    e.stopPropagation()
    justDragged.current = false
    latest.current = colSplits
    e.currentTarget.ownerSVGElement?.setPointerCapture(e.pointerId)
    setDragging(index)
  }
  const drag = (e: PointerEvent<SVGSVGElement>) => {
    if (dragging === null || !onColSplitsChange) return
    const pt = eventToSvg(e)
    if (!pt) return
    justDragged.current = true
    latest.current = moveColSplit(latest.current, dragging, svgToCourt(side, pt).x)
    onColSplitsChange(latest.current)
  }
  const release = () => {
    // 点線をタップしただけ（動かしていない）なら保存しない。保存は DB への書き込みと、ほかの端末への通知になる
    if (dragging !== null && justDragged.current) onColSplitsCommit?.(latest.current)
    setDragging(null)
  }

  return (
    <svg
      className={dragging === null ? 'court' : 'court is-dragging'}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      role="img"
      aria-label={label}
      onClick={handleClick}
      onPointerDown={() => {
        // 前のドラッグのあとにクリックが来なかったときも、次のタップを捨てない
        justDragged.current = false
      }}
      onPointerMove={drag}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <CourtLayer side={side} marks={marks} highlightZone={highlightZone} colSplits={colSplits} />
      {/* 点線をつかむための、見えない太い線 */}
      {canDrag &&
        colSplits.map((s, i) => (
          <line
            key={i}
            x1={MARGIN_X + COURT_W * s}
            x2={MARGIN_X + COURT_W * s}
            y1={MARGIN_Y}
            y2={MARGIN_Y + COURT_H}
            className="court-split-handle"
            aria-label={`列の境目（${i === 0 ? '左' : '右'}）`}
            onPointerDown={grab(i === 0 ? 0 : 1)}
          />
        ))}
    </svg>
  )
}

interface LayerProps {
  side: CourtSide
  marks?: readonly CourtMark[]
  highlightZone?: number | null
  /** 相手コートの列の境目（F-24）。自コートでは使わない */
  colSplits?: ColSplits
}

/**
 * 片面のコート（床・ゾーン・線・ネット・印）。座標は viewBox 0 0 VIEW_W VIEW_H のまま描くので、
 * 両面のコート図（FullCourt）では <g transform> でずらして重ねる
 */
export function CourtLayer({
  side,
  marks = [],
  highlightZone = null,
  colSplits = DEFAULT_COL_SPLITS,
}: LayerProps) {
  const netY = side === 'opponent' ? MARGIN_Y + COURT_H : MARGIN_Y
  const attackY = courtToSvg(side, { x: 0, y: ATTACK_LINE_Y }).y

  /** ゾーンの長方形（SVG 上）。1〜6 以外は null */
  const zoneRect = (zone: number) => {
    const b = zoneBounds(side, zone, colSplits)
    if (!b) return null
    const a = courtToSvg(side, { x: b.x0, y: b.y0 })
    const c = courtToSvg(side, { x: b.x1, y: b.y1 })
    return {
      x: Math.min(a.x, c.x),
      y: Math.min(a.y, c.y),
      width: Math.abs(c.x - a.x),
      height: Math.abs(c.y - a.y),
    }
  }
  const highlight = highlightZone === null ? null : zoneRect(highlightZone)

  return (
    <>
      <rect x={MARGIN_X} y={MARGIN_Y} width={COURT_W} height={COURT_H} className="court-floor" />
      {/* ゾーンごとに色を塗り、ひと目でどのエリアかわかるようにする（部活フィードバック） */}
      {allZones(side).map((z) => {
        const r = zoneRect(z)
        return r && <rect key={z} {...r} fill={zoneColor(z)} className="court-zone" />
      })}
      {/* 列の境目の点線。相手コートはセットごとに動かせる（F-24）。自コートは 3 等分のまま */}
      {(side === 'opponent' ? colSplits : DEFAULT_COL_SPLITS).map((s, i) => (
        <line
          key={i}
          x1={MARGIN_X + COURT_W * s}
          x2={MARGIN_X + COURT_W * s}
          y1={MARGIN_Y}
          y2={MARGIN_Y + COURT_H}
          className="court-zone-line"
        />
      ))}
      <line x1={MARGIN_X} x2={MARGIN_X + COURT_W} y1={attackY} y2={attackY} className="court-line" />
      {allZones(side).map((z) => {
        const c = zoneCenter(side, z, colSplits)
        if (!c) return null
        const p = courtToSvg(side, c)
        return (
          <text key={z} x={p.x} y={p.y} className="court-zone-num" style={{ fill: zoneColor(z) }}>
            {zoneLabel(z)}
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
      {highlight && <rect {...highlight} className="court-highlight" />}
      {marks.map((m, i) => {
        const p = courtToSvg(side, m)
        if (m.color === undefined || m.label === undefined) {
          return <circle key={i} cx={p.x} cy={p.y} r={2.6} className="court-mark" />
        }
        return (
          <g key={i} className="court-player-mark" transform={`translate(${p.x} ${p.y})`}>
            <circle r={3.6} style={{ fill: m.color }} />
            <text>{m.label}</text>
          </g>
        )
      })}
    </>
  )
}
