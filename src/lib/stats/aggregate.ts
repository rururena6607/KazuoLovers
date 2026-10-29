// 集計（要件定義書 F-11、F-21）。T-20。
// 記録の並びを、選手・ゾーン・サーブの種類・打つ位置・セット・相手などで分けて指標を出す。
// 分け方のキーがない記録（選手が未入力、アウトなど）は、その分け方の集計には入れない。
// 範囲の選択（試合・セット・相手・練習）は、呼ぶ側が記録を絞ってから渡す。
import type {
  AttackRecord,
  AttackStats,
  AttackType,
  Grade,
  ReceptionRecord,
  ReceptionResult,
  ReceptionStats,
  ServeRecord,
  ServeStats,
  ServeType,
  SetRecords,
} from '../../contracts/index.ts'
import { serveFromZoneOf, zoneOf } from '../court/index.ts'
import { attackStatsOf, receptionStatsOf, receptionStatsOfResults, serveStatsOf } from './metrics.ts'

/** ヒートマップに並べるゾーン（左上から読む順ではなく番号順） */
const ZONE_NUMBERS = [1, 2, 3, 4, 5, 6] as const

/** キーごとに分ける。キーが null の記録は入れない。キーは最初に現れた順に並ぶ */
export function groupBy<T, K>(items: readonly T[], keyOf: (item: T) => K | null): Map<K, T[]> {
  const groups = new Map<K, T[]>()
  for (const item of items) {
    const key = keyOf(item)
    if (key === null) continue
    const group = groups.get(key)
    if (group) group.push(item)
    else groups.set(key, [item])
  }
  return groups
}

function mapValues<K, T, V>(groups: Map<K, T[]>, f: (items: T[]) => V): Map<K, V> {
  const out = new Map<K, V>()
  for (const [key, items] of groups) out.set(key, f(items))
  return out
}

/** 6 つのゾーンすべてを番号順に入れる。1 本もないゾーンは本数 0 の値になる */
function perZone<T, V>(items: readonly T[], zoneOfItem: (item: T) => number | null, f: (items: T[]) => V): Map<number, V> {
  const groups = groupBy(items, zoneOfItem)
  return new Map(ZONE_NUMBERS.map((zone) => [zone, f(groups.get(zone) ?? [])]))
}

// ---- 自チームのサーブ ----

/** サーバー（players の id）別 */
export const serveStatsByPlayer = (serves: readonly ServeRecord[]): Map<string, ServeStats> =>
  mapValues(groupBy(serves, (s) => s.serverId), serveStatsOf)

export const serveStatsByType = (serves: readonly ServeRecord[]): Map<ServeType, ServeStats> =>
  mapValues(groupBy(serves, (s) => s.serveType), serveStatsOf)

/** 打つ位置別。エンドライン上の位置を自コート奥のゾーン（5・6・1）にして分ける */
export const serveStatsByFromZone = (serves: readonly ServeRecord[]): Map<number, ServeStats> =>
  mapValues(groupBy(serves, (s) => serveFromZoneOf(s.fromX)), serveStatsOf)

/** 着弾ゾーン別（相手コート）。アウトとネットは着弾のゾーンがないので入れない */
export const serveStatsByLandingZone = (serves: readonly ServeRecord[]): Map<number, ServeStats> =>
  perZone(serves, (s) => zoneOf('opponent', s.toX, s.toY), serveStatsOf)

/**
 * 相手選手別のサーブレシーブ成功率。自チームのサーブで、受けた相手選手（receiverId）が入っている分だけ。
 * エースは被エース、イン（評価 A〜D）はその評価として数える。ミスと、評価が未入力のインは入れない
 */
export const opponentReceptionStatsByPlayer = (
  serves: readonly ServeRecord[],
): Map<string, ReceptionStats> =>
  mapValues(
    groupBy(serves, (s) => (s.receiverId !== null && resultAsReception(s) !== null ? s.receiverId : null)),
    (group) => receptionStatsOfResults(group.flatMap((s) => resultAsReception(s) ?? [])),
  )

function resultAsReception(s: ServeRecord): ReceptionResult | null {
  if (s.result === 'ace') return 'ace'
  if (s.result === 'in') return s.reception
  return null
}

// ---- 自チームのレシーブ ----

/** レシーバー（players の id）別。相手ミスはレシーバーがいないので入らない */
export const receptionStatsByPlayer = (receptions: readonly ReceptionRecord[]): Map<string, ReceptionStats> =>
  mapValues(groupBy(receptions, (r) => r.receiverId), receptionStatsOf)

/** 相手のサーブの種類別 */
export const receptionStatsByOppServeType = (
  receptions: readonly ReceptionRecord[],
): Map<ServeType, ReceptionStats> => mapValues(groupBy(receptions, (r) => r.oppServeType), receptionStatsOf)

/** 受けた位置別（自コート）。崩されやすい位置を見る */
export const receptionStatsByZone = (receptions: readonly ReceptionRecord[]): Map<number, ReceptionStats> =>
  perZone(receptions, (r) => zoneOf('own', r.atX, r.atY), receptionStatsOf)

// ---- アタック ----

export const attackStatsByPlayer = (attacks: readonly AttackRecord[]): Map<string, AttackStats> =>
  mapValues(groupBy(attacks, (a) => a.attackerId), attackStatsOf)

export const attackStatsByType = (attacks: readonly AttackRecord[]): Map<AttackType, AttackStats> =>
  mapValues(groupBy(attacks, (a) => a.attackType), attackStatsOf)

/** 前のサーブレシーブの評価（A〜D）別。切り返しのアタックは入れない */
export const attackStatsByPrevReception = (attacks: readonly AttackRecord[]): Map<Grade, AttackStats> =>
  mapValues(groupBy(attacks, (a) => a.prevReception), attackStatsOf)

/** 前衛とバックアタック。バックアタック決定率は back の killRate */
export const attackStatsByRow = (attacks: readonly AttackRecord[]): { front: AttackStats; back: AttackStats } => ({
  front: attackStatsOf(attacks.filter((a) => !a.isBack)),
  back: attackStatsOf(attacks.filter((a) => a.isBack)),
})

// ---- 練習 ----

export interface PracticeStats {
  attempts: number
  /** 入った本数（ミス以外） */
  successes: number
  /** 成功率 = 入った本数 ÷ 本数 × 100 */
  successRate: number | null
  /** 狙ったゾーンを選んだ本数 */
  targeted: number
  /** そのうち狙ったゾーンに入った本数 */
  zoneHits: number
  /** ゾーン的中率 = 狙ったゾーンに入った本数 ÷ 本数 × 100（本数は狙ったゾーンを選んだ分） */
  zoneHitRate: number | null
}

const percent = (n: number, d: number): number | null => (d === 0 ? null : (n * 100) / d)

export function practiceStatsOf(serves: readonly ServeRecord[]): PracticeStats {
  let successes = 0
  let targeted = 0
  let zoneHits = 0
  for (const s of serves) {
    if (s.result !== 'miss') successes++
    if (s.targetZone === null) continue
    targeted++
    if (zoneOf('opponent', s.toX, s.toY) === s.targetZone) zoneHits++
  }
  return {
    attempts: serves.length,
    successes,
    successRate: percent(successes, serves.length),
    targeted,
    zoneHits,
    zoneHitRate: percent(zoneHits, targeted),
  }
}

export const practiceStatsByPlayer = (serves: readonly ServeRecord[]): Map<string, PracticeStats> =>
  mapValues(groupBy(serves, (s) => s.serverId), practiceStatsOf)

/** 狙ったゾーン別。狙いを選んでいない記録は入れない */
export const practiceStatsByTargetZone = (serves: readonly ServeRecord[]): Map<number, PracticeStats> =>
  perZone(serves, (s) => s.targetZone, practiceStatsOf)

// ---- セット別・相手別・日別などの要約 ----

export interface Summary {
  serve: ServeStats
  reception: ReceptionStats
  attack: AttackStats
}

type PlayRecords = Pick<SetRecords, 'serves' | 'receptions' | 'attacks'>

export const summaryOf = (records: PlayRecords): Summary => ({
  serve: serveStatsOf(records.serves),
  reception: receptionStatsOf(records.receptions),
  attack: attackStatsOf(records.attacks),
})

/** セット別（setId をキーに）。セット別の結果（F-21）の指標に使う */
export const summaryBySet = (sets: readonly SetRecords[]): Map<string, Summary> =>
  new Map(sets.map((set) => [set.setId, summaryOf(set)]))

/**
 * セットをまとめて要約する。keyOfSet に「相手の id」「試合の id」「日付」などを返す関数を渡すと、
 * 相手別・試合別・日ごとの推移になる。null を返したセットは入れない
 */
export function summaryByGroup(
  sets: readonly SetRecords[],
  keyOfSet: (set: SetRecords) => string | null,
): Map<string, Summary> {
  return mapValues(groupBy(sets, keyOfSet), (group) =>
    summaryOf({
      serves: group.flatMap((s) => s.serves),
      receptions: group.flatMap((s) => s.receptions),
      attacks: group.flatMap((s) => s.attacks),
    }),
  )
}
