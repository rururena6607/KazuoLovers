// 作戦ボードの SVG とコート座標（0.0〜1.0）の変換。要件定義書 6 章のコート図と同じく、コートの周りに余白を取る。
import { ATTACK_LINE_Y } from '../../contracts/index.ts'
import { clamp01, type Point } from './boardModel.ts'

/** コートは 9m × 18m。SVG 上でも同じ比にする */
export const COURT_W = 180
export const COURT_H = 360
export const MARGIN = 10
export const VIEW_W = COURT_W + MARGIN * 2
export const VIEW_H = COURT_H + MARGIN * 2

/** 駒の半径 */
export const PIECE_R = 12

export const toSvg = (p: Point): Point => ({ x: MARGIN + p.x * COURT_W, y: MARGIN + p.y * COURT_H })

/** SVG 上の点をコート座標に直す。コートの外は端に寄せる */
export const fromSvg = (p: Point): Point => ({
  x: clamp01((p.x - MARGIN) / COURT_W),
  y: clamp01((p.y - MARGIN) / COURT_H),
})

/** ネットの y（コート座標）。相手コートと自コートの境目 */
export const NET_Y = 0.5

/** アタックライン（ネットから 3m）の y を、相手コート側・自コート側の順に返す。ATTACK_LINE_Y は 1 面の奥行きに対する割合 */
export const attackLinesY = (): readonly [number, number] => {
  const offset = NET_Y * ATTACK_LINE_Y
  return [NET_Y - offset, NET_Y + offset]
}
