// コース割合（要件定義書 5 章「指標」のコース。アプリ独自の指標で、JVA の記録票にはない）。T-21。
//   着弾ゾーン割合   = そのゾーンに着弾したサーブ ÷ 着弾点のあるサーブ × 100 〔%〕
//   受けた位置の割合 = そのゾーンで受けたサーブ ÷ 位置を記録したサーブレシーブ × 100 〔%〕
// 分母は座標のある記録の本数で、ネット（着弾点なし）や位置を入れなかったレシーブは入れない。
// アウト（コートの外の座標）は座標があるので分母に入れる。そのため、ゾーンの割合を足しても 100% にならないことがある。
// 範囲の選択（試合・セット・相手）は、呼ぶ側が記録を絞ってから渡す。練習のサーブは渡さない。
// ゾーンに分ける関数（lib/court の zoneOf）は、呼ぶ側が引数で渡す（lib/stats は lib/court に依存しない）。
import { ZONES, type ReceptionRecord, type ServeRecord } from '../../contracts/index.ts'
import type { ZoneOf } from './aggregate.ts'
import { percent } from './metrics.ts'

export interface CourseZone {
  /** そのゾーンの本数 */
  count: number
  /** 割合〔%〕。分母が 0 なら null */
  share: number | null
}

export interface CourseShare {
  /** 分母：座標のある記録の本数（アウトを含む） */
  total: number
  /** 6 ゾーンすべてを番号順に。0 本のゾーンは count 0 */
  zones: Map<number, CourseZone>
}

/** ゾーン番号（番号順）。相手コートと自コートで番号は同じ 1〜6 */
const ZONE_NUMBERS: readonly number[] = [...ZONES.opponent.front, ...ZONES.opponent.back].sort(
  (a, b) => a - b,
)

function shareOf(zones: readonly (number | null)[], total: number): CourseShare {
  const counts = new Map<number, number>(ZONE_NUMBERS.map((z) => [z, 0]))
  for (const zone of zones) {
    if (zone !== null) counts.set(zone, (counts.get(zone) ?? 0) + 1)
  }
  return {
    total,
    zones: new Map(
      [...counts].map(([zone, count]) => [zone, { count, share: percent(count, total) }]),
    ),
  }
}

/** 自チームのサーブの着弾ゾーン割合（相手コート） */
export function serveLandingShare(serves: readonly ServeRecord[], zoneOf: ZoneOf): CourseShare {
  const withPoint = serves.filter((s) => s.toX !== null && s.toY !== null)
  return shareOf(
    withPoint.map((s) => zoneOf('opponent', s.toX, s.toY)),
    withPoint.length,
  )
}

/** 自チームのサーブレシーブの、受けた位置の割合（自コート）。相手ミスや位置なしは分母に入れない */
export function receptionPositionShare(
  receptions: readonly ReceptionRecord[],
  zoneOf: ZoneOf,
): CourseShare {
  const withPoint = receptions.filter((r) => r.atX !== null && r.atY !== null)
  return shareOf(
    withPoint.map((r) => zoneOf('own', r.atX, r.atY)),
    withPoint.length,
  )
}
