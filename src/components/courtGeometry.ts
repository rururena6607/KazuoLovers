// コート図（SVG）の寸法と、SVG 上の点 ↔ コートの座標（0.0〜1.0）の変換。
// コートの座標は contracts/records.ts のとおり、記録する側から見て
// x は左端 0.0〜右端 1.0、y はネット側 0.0〜エンドライン 1.0。
// 画面では相手コートはネットが下（奥のエンドラインが上）、自コートはネットが上に来る。
import type { CourtSide } from '../lib/court/index.ts'

/** viewBox の大きさ。コートの外（アウト）もタップできるよう、周りに余白をとる */
export const VIEW_W = 120
export const VIEW_H = 76
export const MARGIN_X = 10
export const MARGIN_Y = 8
export const COURT_W = VIEW_W - 2 * MARGIN_X // 100
export const COURT_H = VIEW_H - 2 * MARGIN_Y // 60

export interface CourtPoint {
  x: number
  y: number
}

/** コートの座標 → SVG 上の点（描くときに使う） */
export function courtToSvg(side: CourtSide, p: CourtPoint): CourtPoint {
  const sx = MARGIN_X + p.x * COURT_W
  // 相手コートはネット（y=0）が下の端、自コートはネットが上の端
  const sy = side === 'opponent' ? MARGIN_Y + (1 - p.y) * COURT_H : MARGIN_Y + p.y * COURT_H
  return { x: sx, y: sy }
}

/** SVG 上の点 → コートの座標（タップしたときに使う）。courtToSvg の逆 */
export function svgToCourt(side: CourtSide, s: CourtPoint): CourtPoint {
  const x = (s.x - MARGIN_X) / COURT_W
  const y = side === 'opponent' ? (MARGIN_Y - s.y) / COURT_H + 1 : (s.y - MARGIN_Y) / COURT_H
  return { x, y }
}
