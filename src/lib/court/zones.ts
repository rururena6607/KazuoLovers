// 座標とゾーン（①〜⑥）の変換（要件定義書 6 章、7 章）。T-07。
// 座標は記録する側から見た向きで、x は左端 0.0〜右端 1.0、y はネット側 0.0〜エンドライン 1.0。
// ゾーンは保存せず、座標から計算する。ゾーン番号の並びは config.ts の ZONES が正で、
// 行（ネット側から奥へ）と列の数は ZONES の形から求める（分け方が変わっても、ここは直さない）。
// 相手コートの列の境目は、セットごとに動かせる（F-24）。呼ぶ側が colSplits（GameSet の colSplit1・colSplit2）を渡す。
// 渡さなければ等分。自コートの境目は動かさないので、colSplits は相手コートにだけ使い、自コートでは無視する。
import { ATTACK_LINE_Y, ZONES, type Side } from '../../contracts/index.ts'

export type CourtSide = keyof typeof ZONES

/** チーム（us／opp）に対応するコート。us は自コート、opp は相手コート */
export const courtSideOf = (side: Side): CourtSide => (side === 'us' ? 'own' : 'opponent')

/**
 * 相手コートの列の境目（左の列と中の列、中の列と右の列の間。0.0〜1.0）。GameSet の colSplit1・colSplit2 と同じ。
 * 0 ≤ 1つ目 < 2つ目 ≤ 1 でなければ、等分として扱う。列が3つでない分け方のときも等分
 */
export type ColSplits = readonly [number, number]

export interface ZoneBounds {
  x0: number
  x1: number
  y0: number
  y1: number
}

interface Row {
  zones: readonly number[]
  y0: number
  y1: number
}

/** ネット側から奥へ並べた行。zoneOf と zoneBounds が同じ表を使う */
const rowsOf = (side: CourtSide): readonly Row[] => [
  { zones: ZONES[side].front, y0: 0, y1: ATTACK_LINE_Y },
  { zones: ZONES[side].back, y0: ATTACK_LINE_Y, y1: 1 },
]

const inRange = (v: number): boolean => v >= 0 && v <= 1

/** 列の境目の x。長さは列の数 + 1 で、最初は 0、最後は 1。渡された境目が使えるときだけ、それを使う */
function columnEdges(side: CourtSide, columns: number, colSplits: ColSplits | undefined): number[] {
  if (side === 'opponent' && colSplits !== undefined && columns === colSplits.length + 1) {
    const [a, b] = colSplits
    if (inRange(a) && inRange(b) && a < b) return [0, a, b, 1]
  }
  return Array.from({ length: columns + 1 }, (_, i) => i / columns)
}

/**
 * 座標が入るゾーン番号。コートの外（アウト）と、座標がないとき（ネット）は null。
 * 境目の線上は、右側・奥側のゾーンに入れる。ただし右端・エンドライン上はコートの中とする。
 * colSplits は相手コートの列の境目（省略すると等分）。
 */
export function zoneOf(
  side: CourtSide,
  x: number | null,
  y: number | null,
  colSplits?: ColSplits,
): number | null {
  if (x === null || y === null || !inRange(x) || !inRange(y)) return null
  const rows = rowsOf(side)
  const row = rows.find((r) => y < r.y1) ?? rows.at(-1)
  if (!row) return null
  const columns = row.zones.length
  const edges = columnEdges(side, columns, colSplits)
  // 両端（0 と 1）を除いた境目のうち、x 以下のものの数が、列の番号（境目の線上は右の列）
  const column = Math.min(columns - 1, edges.slice(1, -1).filter((edge) => edge <= x).length)
  return row.zones[column] ?? null
}

/** エンドライン上の打つ位置（x）に対応する後衛のゾーン番号。範囲外・未入力は null */
export function serveFromZoneOf(x: number | null): number | null {
  return zoneOf('own', x, 1)
}

/**
 * ゾーンの範囲。ヒートマップや練習モードの描画に使う。ゾーンにない番号は null。
 * colSplits は相手コートの列の境目（省略すると等分）
 */
export function zoneBounds(side: CourtSide, zone: number, colSplits?: ColSplits): ZoneBounds | null {
  for (const row of rowsOf(side)) {
    const column = row.zones.indexOf(zone)
    if (column < 0) continue
    const edges = columnEdges(side, row.zones.length, colSplits)
    return { x0: edges[column] ?? 0, x1: edges[column + 1] ?? 1, y0: row.y0, y1: row.y1 }
  }
  return null
}

/** ゾーンの中心の座標。ゾーンにない番号は null。colSplits は相手コートの列の境目（省略すると等分） */
export function zoneCenter(
  side: CourtSide,
  zone: number,
  colSplits?: ColSplits,
): { x: number; y: number } | null {
  const b = zoneBounds(side, zone, colSplits)
  return b === null ? null : { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }
}
