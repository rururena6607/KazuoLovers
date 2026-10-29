// 座標とゾーン（①〜⑥）の変換（要件定義書 6 章、7 章）。T-07。
// 座標は記録する側から見た向きで、x は左端 0.0〜右端 1.0、y はネット側 0.0〜エンドライン 1.0。
// ゾーンは保存せず、座標から計算する。ゾーン番号の並びは config.ts の ZONES が正。
import { ATTACK_LINE_Y, ZONES } from '../../contracts/index.ts'

export type CourtSide = keyof typeof ZONES

export interface ZoneBounds {
  x0: number
  x1: number
  y0: number
  y1: number
}

const COLUMNS = 3

const inRange = (v: number): boolean => v >= 0 && v <= 1

/**
 * 座標が入るゾーン番号（1〜6）。コートの外（アウト）と、座標がないとき（ネット）は null。
 * 境目の線上は、右側・奥側のゾーンに入れる。ただし右端・エンドライン上はコートの中とする。
 */
export function zoneOf(side: CourtSide, x: number | null, y: number | null): number | null {
  if (x === null || y === null || !inRange(x) || !inRange(y)) return null
  const column = Math.min(COLUMNS - 1, Math.floor(x * COLUMNS))
  const row = y < ATTACK_LINE_Y ? ZONES[side].front : ZONES[side].back
  return row[column] ?? null
}

/** エンドライン上の打つ位置（x）に対応する後衛のゾーン番号。範囲外・未入力は null */
export function serveFromZoneOf(x: number | null): number | null {
  return zoneOf('own', x, 1)
}

/** ゾーンの範囲。ヒートマップや練習モードの描画に使う。1〜6 以外は null */
export function zoneBounds(side: CourtSide, zone: number): ZoneBounds | null {
  const front: readonly number[] = ZONES[side].front
  const back: readonly number[] = ZONES[side].back
  const frontColumn = front.indexOf(zone)
  const backColumn = back.indexOf(zone)
  const column = frontColumn >= 0 ? frontColumn : backColumn
  if (column < 0) return null
  const isFront = frontColumn >= 0
  return {
    x0: column / COLUMNS,
    x1: (column + 1) / COLUMNS,
    y0: isFront ? 0 : ATTACK_LINE_Y,
    y1: isFront ? ATTACK_LINE_Y : 1,
  }
}

/** ゾーンの中心の座標。1〜6 以外は null */
export function zoneCenter(side: CourtSide, zone: number): { x: number; y: number } | null {
  const b = zoneBounds(side, zone)
  return b === null ? null : { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }
}
