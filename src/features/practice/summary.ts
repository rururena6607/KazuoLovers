// 練習モードの成績（要件定義書 5 章「練習」）。
//   成功率     = 入った本数 ÷ 本数
//   ゾーン的中率 = 狙ったゾーンに入った本数 ÷ 本数
// 率は % の数値（例：75）で、丸めない。本数が 0 なら null（contracts/stats.ts と同じ決まり）。
import type { ServeRecord } from '../../contracts/index.ts'
import { zoneOf } from '../../lib/court/index.ts'

export interface PracticeSummary {
  /** 本数 */
  total: number
  /** 入った本数 */
  inCount: number
  /** 狙ったゾーンに入った本数 */
  zoneHits: number
  successRate: number | null
  zoneHitRate: number | null
}

/** 着弾点のゾーンが狙ったゾーンと同じか */
export const hitTarget = (s: ServeRecord): boolean =>
  s.result === 'in' && s.targetZone !== null && zoneOf('opponent', s.toX, s.toY) === s.targetZone

export function practiceSummary(serves: readonly ServeRecord[]): PracticeSummary {
  const total = serves.length
  let inCount = 0
  let zoneHits = 0
  for (const s of serves) {
    if (s.result === 'in') inCount++
    if (hitTarget(s)) zoneHits++
  }
  const rate = (n: number) => (total === 0 ? null : (n / total) * 100)
  return { total, inCount, zoneHits, successRate: rate(inCount), zoneHitRate: rate(zoneHits) }
}
