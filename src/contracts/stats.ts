// 指標（要件定義書 5 章「指標」。JVA の公式記録票の式）。実装は lib/stats（とりはる）。
// 率はすべて % の数値（例：11.9）で、丸めない。分母が 0 なら null。丸めは画面に出すときだけ行う。
import type { AttackRecord, ReceptionRecord, ServeRecord } from './records.ts'

export interface ServeStats {
  attempts: number
  aces: number
  /** 効果＝相手のレシーブが C か D */
  effects: number
  misses: number
  /** サーブ効果率 =（エース×100 ＋ 効果×25 − ミス×25）÷ 打数 */
  efficiency: number | null
  aceRate: number | null
  missRate: number | null
}

export interface ReceptionStats {
  /** 受数。相手ミスを除き、被エースを含む */
  receptions: number
  /** 優（A） */
  excellent: number
  /** 良（B） */
  good: number
  aced: number
  /** サーブレシーブ成功率 =（優×100 ＋ 良×50）÷ 受数 */
  successRate: number | null
  acedRate: number | null
}

export interface AttackStats {
  attempts: number
  kills: number
  /** 失点＝ミス＋被ブロック */
  errors: number
  /** アタック決定率 = 得点 ÷ 打数 × 100 */
  killRate: number | null
  /** アタック効果率 =（得点 − 失点）÷ 打数 × 100（補助指標） */
  efficiency: number | null
}

export type ServeStatsOf = (serves: readonly ServeRecord[]) => ServeStats
export type ReceptionStatsOf = (receptions: readonly ReceptionRecord[]) => ReceptionStats
export type AttackStatsOf = (attacks: readonly AttackRecord[]) => AttackStats
