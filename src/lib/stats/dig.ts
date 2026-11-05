// 相手のスパイク（要件定義書 5 章「指標」の「相手のスパイク」、F-25）。アプリ独自の指標で、JVA の記録票にはない。T-50。
//   拾えた率           = 拾えた（A〜D）÷（拾えた ＋ 拾えず）× 100 〔%〕（相手ミスは、拾う場面がないので分母に入れない）
//   落ちた位置の割合   = そのゾーンに落ちた相手のスパイク ÷ 落ちた位置を記録した相手のスパイク × 100 〔%〕
//   打ってくる位置の割合 = そのゾーンから打たれた相手のスパイク ÷ 打った位置を記録した相手のスパイク × 100 〔%〕
// 範囲の選択（試合・セット・相手）は、呼ぶ側が記録を絞ってから渡す。
// ゾーンに分ける関数（lib/court の zoneOf）は、呼ぶ側が引数で渡す（lib/stats は lib/court に依存しない）。
import type { OppAttackRecord } from '../../contracts/index.ts'
import type { SplitsOf, ZoneOf } from './aggregate.ts'
import { shareOf, type CourseShare } from './course.ts'
import { percent } from './metrics.ts'

export interface DigStats {
  /** 記録した相手のスパイクの本数（相手ミスも含む） */
  total: number
  /** 拾えた（結果が A〜D） */
  dug: number
  /** 拾えず（相手の得点） */
  killed: number
  /** 相手のアタックミス。拾う場面がないので、拾えた率の分母には入れない */
  oppError: number
  /** 拾えた率〔%〕＝ dug ÷（dug ＋ killed）。分母が 0 なら null */
  digRate: number | null
}

export function digStatsOf(records: readonly OppAttackRecord[]): DigStats {
  let dug = 0
  let killed = 0
  let oppError = 0
  for (const r of records) {
    if (r.result === 'killed') killed++
    else if (r.result === 'opp_error') oppError++
    else dug++ // A〜D。評価の良し悪しは、この率には入れない
  }
  return { total: records.length, dug, killed, oppError, digRate: percent(dug, dug + killed) }
}

/** 落ちた位置の割合（自コート）。位置を入れなかった記録は分母に入れない */
export function digLandingShare(records: readonly OppAttackRecord[], zoneOf: ZoneOf): CourseShare {
  const withPoint = records.filter((r) => r.toX !== null && r.toY !== null)
  return shareOf(
    withPoint.map((r) => zoneOf('own', r.toX, r.toY)),
    withPoint.length,
  )
}

/** 打ってくる位置の割合（相手コート）。位置を入れなかった記録は分母に入れない */
export function digOriginShare(
  records: readonly OppAttackRecord[],
  zoneOf: ZoneOf,
  splitsOf?: SplitsOf,
): CourseShare {
  const withPoint = records.filter((r) => r.fromX !== null && r.fromY !== null)
  return shareOf(
    withPoint.map((r) => zoneOf('opponent', r.fromX, r.fromY, splitsOf?.(r.setId))),
    withPoint.length,
  )
}
