// 指標の計算（要件定義書 5 章。JVA の公式記録票の式）。T-06。
// 率は % の数値で、丸めない。分母が 0 なら null。
import type {
  AttackStatsOf,
  ReceptionStatsOf,
  ServeStatsOf,
} from '../../contracts/index.ts'

const ratio = (numerator: number, denominator: number): number | null =>
  denominator === 0 ? null : numerator / denominator

export const serveStatsOf: ServeStatsOf = (serves) => {
  let aces = 0
  let effects = 0
  let misses = 0
  for (const s of serves) {
    if (s.result === 'ace') aces++
    else if (s.result === 'miss') misses++
    else if (s.reception === 'C' || s.reception === 'D') effects++
  }
  const attempts = serves.length
  return {
    attempts,
    aces,
    effects,
    misses,
    efficiency: ratio(aces * 100 + effects * 25 - misses * 25, attempts),
    aceRate: ratio(aces * 100, attempts),
    missRate: ratio(misses * 100, attempts),
  }
}

export const receptionStatsOf: ReceptionStatsOf = (records) => {
  let receptions = 0
  let excellent = 0
  let good = 0
  let aced = 0
  for (const r of records) {
    if (r.result === 'opp_miss') continue
    receptions++
    if (r.result === 'A') excellent++
    else if (r.result === 'B') good++
    else if (r.result === 'ace') aced++
  }
  return {
    receptions,
    excellent,
    good,
    aced,
    successRate: ratio(excellent * 100 + good * 50, receptions),
    acedRate: ratio(aced * 100, receptions),
  }
}

export const attackStatsOf: AttackStatsOf = (attacks) => {
  let kills = 0
  let errors = 0
  for (const a of attacks) {
    if (a.result === 'kill') kills++
    else if (a.result === 'error' || a.result === 'blocked') errors++
  }
  const attempts = attacks.length
  return {
    attempts,
    kills,
    errors,
    killRate: ratio(kills * 100, attempts),
    efficiency: ratio((kills - errors) * 100, attempts),
  }
}
