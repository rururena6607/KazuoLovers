// 指標の計算（要件定義書 5 章。JVA の公式記録票の式）。T-06。
// 率は % の数値で、丸めない。分母が 0 なら null。
//
// 渡す記録は「試合」のものだけにする。練習のサーブ（reception が null のイン）を混ぜると、
// 効果に数えられないまま打数に入り、サーブ効果率が低く出る。範囲の絞り込みは呼ぶ側（features/analysis の
// recordsInScope）が行い、練習は practiceStatsOf で別に出す。
import type {
  AttackStatsOf,
  ReceptionResult,
  ReceptionStats,
  ReceptionStatsOf,
  ServeRecord,
  ServeStats,
  ServeStatsOf,
} from '../../contracts/index.ts'

/** n ÷ d × 100。d が 0 なら null。分子は「点」（例：エース 1 点、効果 0.25 点）で渡す */
export const percent = (n: number, d: number): number | null => (d === 0 ? null : (n * 100) / d)

/** 結果の種類が増えたとき、ここでコンパイルエラーにして数え漏れを防ぐ */
const unreachable = (value: never): never => {
  throw new Error(`未対応の結果です：${String(value)}`)
}

/**
 * サーブ効果率 =（エース×100 ＋ 効果×25 − ミス×25）÷ 打数。効果＝イン（受けた評価が C か D）。
 * 受けた評価が未入力のインは打数に入り、効果には数えない。
 */
export const serveStatsOf: ServeStatsOf = (serves) => {
  let aces = 0
  let effects = 0
  let misses = 0
  for (const s of serves) {
    switch (s.result) {
      case 'ace':
        aces++
        break
      case 'miss':
        misses++
        break
      case 'in':
        if (s.reception === 'C' || s.reception === 'D') effects++
        break
      default:
        unreachable(s.result)
    }
  }
  const attempts = serves.length
  return {
    attempts,
    aces,
    effects,
    misses,
    efficiency: percent(aces + (effects - misses) * 0.25, attempts),
    aceRate: percent(aces, attempts),
    missRate: percent(misses, attempts),
  }
}

/** 崩し率 =（エース ＋ C ＋ D）÷ 打数（相手を崩した割合。アプリ独自の補助指標）。集計済みの値から出す */
export const breakRateOfStats = (s: ServeStats): number | null => percent(s.aces + s.effects, s.attempts)

export const breakRateOf = (serves: readonly ServeRecord[]): number | null =>
  breakRateOfStats(serveStatsOf(serves))

/** 受けた結果の並びから出す。自チームのレシーブと、相手選手別のレシーブ（自チームのサーブ側の記録）で共通 */
export const receptionStatsOfResults = (results: readonly ReceptionResult[]): ReceptionStats => {
  let receptions = 0
  let excellent = 0
  let good = 0
  let aced = 0
  for (const result of results) {
    switch (result) {
      case 'opp_miss':
        continue
      case 'A':
        excellent++
        break
      case 'B':
        good++
        break
      case 'ace':
        aced++
        break
      case 'C':
      case 'D':
        break
      default:
        unreachable(result)
    }
    receptions++
  }
  return {
    receptions,
    excellent,
    good,
    aced,
    successRate: percent(excellent + good * 0.5, receptions),
    acedRate: percent(aced, receptions),
  }
}

export const receptionStatsOf: ReceptionStatsOf = (records) =>
  receptionStatsOfResults(records.map((r) => r.result))

/** A返球率 = A ÷ 受数（要件定義書 5 章） */
export function excellentRateOf(results: readonly ReceptionResult[]): number | null {
  const { excellent, receptions } = receptionStatsOfResults(results)
  return percent(excellent, receptions)
}

export const attackStatsOf: AttackStatsOf = (attacks) => {
  let kills = 0
  let errors = 0
  for (const a of attacks) {
    switch (a.result) {
      case 'kill':
        kills++
        break
      case 'error':
      case 'blocked':
        errors++
        break
      case 'continue':
        break
      default:
        unreachable(a.result)
    }
  }
  const attempts = attacks.length
  return {
    attempts,
    kills,
    errors,
    killRate: percent(kills, attempts),
    efficiency: percent(kills - errors, attempts),
  }
}
