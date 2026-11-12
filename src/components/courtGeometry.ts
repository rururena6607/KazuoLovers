// コート図（SVG）の寸法と、SVG 上の点 ↔ コートの座標（0.0〜1.0）の変換。
// コートの座標は contracts/records.ts のとおり、記録する側から見て
// x は左端 0.0〜右端 1.0、y はネット側 0.0〜エンドライン 1.0。
// 画面では相手コートはネットが下（奥のエンドラインが上）、自コートはネットが上に来る。
import type { MouseEvent } from 'react'
import { DEFAULT_COL_SPLITS, ZONES } from '../contracts/index.ts'
import type { ColSplits, CourtSide } from '../lib/court/index.ts'

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

/** タップした画面上の位置 → viewBox の座標。取れないときは null */
export function eventToSvg(e: MouseEvent<SVGSVGElement>): CourtPoint | null {
  const ctm = e.currentTarget.getScreenCTM()
  if (!ctm) return null
  const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
  return { x: pt.x, y: pt.y }
}

/** ゾーンの色（theme.css の --zone-1〜--zone-6）。1〜6 以外は文字の色 */
export const zoneColor = (zone: number): string =>
  zone >= 1 && zone <= 6 ? `var(--zone-${zone})` : 'var(--ink)'

/** ゾーン番号の丸数字 */
export const zoneLabel = (zone: number): string => '①②③④⑤⑥⑦⑧⑨'[zone - 1] ?? String(zone)

/** そのコートのゾーン番号すべて（小さい順）。並びの正は config.ts の ZONES */
export const allZones = (side: CourtSide): number[] =>
  [...ZONES[side].front, ...ZONES[side].back].sort((a, b) => a - b)

// 両面のコート図（FullCourt）：上に相手コート、下に自コート、真ん中にネット。
// 片面の図をそのまま重ね、自コートは COURT_H だけ下にずらす（ネットの線が重なる）。
// 矢印（F-20 アタック・F-25 相手のスパイク）のように、ネットをまたぐ線を描くのに使う。

/** 両面の図の viewBox の高さ */
export const FULL_VIEW_H = VIEW_H + COURT_H
/** 自コートを描くときに下へずらす量 */
export const OWN_OFFSET_Y = COURT_H
/** 両面の図でのネットの高さ */
export const FULL_NET_Y = MARGIN_Y + COURT_H

/** 両面の図の上の点 → どちらのコートのどの座標か。ネットの線より上は相手コート */
export function fullToCourt(s: CourtPoint): { side: CourtSide; p: CourtPoint } {
  if (s.y < FULL_NET_Y) return { side: 'opponent', p: svgToCourt('opponent', s) }
  return { side: 'own', p: svgToCourt('own', { x: s.x, y: s.y - OWN_OFFSET_Y }) }
}

/** コートの座標 → 両面の図の上の点。fullToCourt の逆 */
export function courtToFull(side: CourtSide, p: CourtPoint): CourtPoint {
  const s = courtToSvg(side, p)
  return side === 'own' ? { x: s.x, y: s.y + OWN_OFFSET_Y } : s
}

// 相手コートの列の境目（F-24）。縦の点線2本を左右に動かす。保存する値は GameSet の colSplit1・colSplit2。

/** 列の境目2本（0.0〜1.0）。型は lib/court（T-50）のものを使う。画面の部品からはここから読めるようにしておく */
export type { ColSplits }

/**
 * 点線どうし・点線とサイドラインを近づけすぎない幅（コートの幅に対する割合）。
 * contracts の「0 ≤ colSplit1 < colSplit2 ≤ 1」を守り、指で点線をつかみ直せるようにする画面だけの値
 */
export const MIN_COL_GAP = 0.05

/**
 * セットの境目。両方そろっていない・0 ≤ 左 < 右 ≤ 1 でないときは既定（3 等分。config の DEFAULT_COL_SPLITS）。
 * lib/court の zoneOf・zoneBounds（T-50）も同じ条件で 3 等分に戻すので、点線とゾーンの色が食い違わない
 */
export const colSplitsOf = (set: { colSplit1?: number; colSplit2?: number }): ColSplits => {
  const { colSplit1: a, colSplit2: b } = set
  // NaN は比べると false になるので、ここで落ちる
  return a !== undefined && b !== undefined && a >= 0 && a < b && b <= 1 ? [a, b] : DEFAULT_COL_SPLITS
}

/** 点線を x へ動かす。index は 0＝左の点線、1＝右の点線。もう一方の点線とサイドラインを越えない */
export function moveColSplit(splits: ColSplits, index: 0 | 1, x: number): ColSplits {
  const [a, b] = splits
  if (index === 0) return [clamp(x, MIN_COL_GAP, b - MIN_COL_GAP), b]
  return [a, clamp(x, a + MIN_COL_GAP, 1 - MIN_COL_GAP)]
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))
