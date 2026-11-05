// 集計（要件定義書 F-11、F-21）。T-20。
// 記録の並びを、選手・ゾーン・サーブの種類・打つ位置・セット・相手などで分けて指標を出す。
// 分け方のキーがない記録（選手が未入力、アウトなど）は、その分け方の集計には入れない。
// 範囲の選択（試合・セット・相手・練習）は、呼ぶ側が記録を絞ってから渡す。
//
// lib/stats は contracts にだけ依存する（実装計画書 3.1）。ゾーンに分ける関数（lib/court の zoneOf）は、
// ゾーンを使う集計の引数 zoneOf として呼ぶ側が渡す。
// 並び：ゾーンは番号順、サーブの種類・攻撃の種類・評価は下の ORDER どおり（記録の順で変わらない）。
// 打つ位置・着弾ゾーン・受けた位置・前のレシーブの評価は、0 本でも全部返す。種類は記録のあるものだけ返す。
import {
  ZONES,
  type AttackRecord,
  type AttackStats,
  type AttackType,
  type Grade,
  type ReceptionRecord,
  type ReceptionResult,
  type ReceptionStats,
  type ServeRecord,
  type ServeStats,
  type ServeType,
  type SetRecords,
} from '../../contracts/index.ts'
import {
  attackStatsOf,
  percent,
  receptionStatsOf,
  receptionStatsOfResults,
  serveStatsOf,
} from './metrics.ts'

type CourtSide = keyof typeof ZONES

/** 座標からゾーン番号を返す関数（lib/court の zoneOf）。アウトとネットは null */
export type ZoneOf = (side: CourtSide, x: number | null, y: number | null) => number | null

const SERVE_TYPE_ORDER: readonly ServeType[] = ['float', 'jump_float', 'jump', 'other']
const ATTACK_TYPE_ORDER: readonly AttackType[] = ['left', 'center', 'right', 'back', 'other']
const GRADE_ORDER: readonly Grade[] = ['A', 'B', 'C', 'D']

/** ヒートマップに並べるゾーン（番号順）。ZONES から求める */
const ZONE_NUMBERS: readonly number[] = [
  ...ZONES.opponent.front,
  ...ZONES.opponent.back,
].sort((a, b) => a - b)

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

/** order の順に、記録のあるキーだけ並べる */
function inOrder<K, V>(map: Map<K, V>, order: readonly K[]): Map<K, V> {
  const out = new Map<K, V>()
  for (const key of order) {
    const value = map.get(key)
    if (value !== undefined) out.set(key, value)
  }
  return out
}

/** keys すべてを順に入れる。1 本もないキーは本数 0 の値になる */
function fixedKeys<T, K, V>(
  items: readonly T[],
  keys: readonly K[],
  keyOf: (item: T) => K | null,
  f: (items: T[]) => V,
): Map<K, V> {
  const groups = groupBy(items, keyOf)
  return new Map(keys.map((key) => [key, f(groups.get(key) ?? [])]))
}

// ---- 自チームのサーブ ----

/** サーバー（players の id）別 */
export const serveStatsByPlayer = (serves: readonly ServeRecord[]): Map<string, ServeStats> =>
  mapValues(groupBy(serves, (s) => s.serverId), serveStatsOf)

export const serveStatsByType = (serves: readonly ServeRecord[]): Map<ServeType, ServeStats> =>
  inOrder(mapValues(groupBy(serves, (s) => s.serveType), serveStatsOf), SERVE_TYPE_ORDER)

/** 打つ位置別。エンドライン上の位置を自コート奥のゾーン（ZONES.own.back の順）に分ける。位置なしは入れない */
export const serveStatsByFromZone = (
  serves: readonly ServeRecord[],
  zoneOf: ZoneOf,
): Map<number, ServeStats> =>
  fixedKeys(serves, ZONES.own.back, (s) => zoneOf('own', s.fromX, 1), serveStatsOf)

/** 着弾ゾーン別（相手コート）。アウトとネットは着弾のゾーンがないので入れない */
export const serveStatsByLandingZone = (
  serves: readonly ServeRecord[],
  zoneOf: ZoneOf,
): Map<number, ServeStats> =>
  fixedKeys(serves, ZONE_NUMBERS, (s) => zoneOf('opponent', s.toX, s.toY), serveStatsOf)

/**
 * 相手選手別のサーブレシーブ成功率。自チームのサーブで、受けた相手選手（receiverId）が入っている分だけ。
 * エースは被エース、イン（評価 A〜D）はその評価として数える。ミスと、評価が未入力のインは入れない
 */
export function opponentReceptionStatsByPlayer(
  serves: readonly ServeRecord[],
): Map<string, ReceptionStats> {
  const rows = serves.flatMap((s) => {
    const result = resultAsReception(s)
    return s.receiverId !== null && result !== null ? [{ id: s.receiverId, result }] : []
  })
  return mapValues(
    groupBy(rows, (r) => r.id),
    (group) => receptionStatsOfResults(group.map((r) => r.result)),
  )
}

function resultAsReception(s: ServeRecord): ReceptionResult | null {
  if (s.result === 'ace') return 'ace'
  if (s.result === 'in') return s.reception
  return null
}

// ---- 自チームのレシーブ ----

/** レシーバー（players の id）別。相手ミスはレシーバーがいないので入らない */
export const receptionStatsByPlayer = (
  receptions: readonly ReceptionRecord[],
): Map<string, ReceptionStats> =>
  mapValues(groupBy(receptions, (r) => r.receiverId), receptionStatsOf)

/** 相手のサーブの種類別 */
export const receptionStatsByOppServeType = (
  receptions: readonly ReceptionRecord[],
): Map<ServeType, ReceptionStats> =>
  inOrder(mapValues(groupBy(receptions, (r) => r.oppServeType), receptionStatsOf), SERVE_TYPE_ORDER)

/** 受けた位置別（自コート）。崩されやすい位置を見る */
export const receptionStatsByZone = (
  receptions: readonly ReceptionRecord[],
  zoneOf: ZoneOf,
): Map<number, ReceptionStats> =>
  fixedKeys(receptions, ZONE_NUMBERS, (r) => zoneOf('own', r.atX, r.atY), receptionStatsOf)

// ---- アタック ----

export const attackStatsByPlayer = (attacks: readonly AttackRecord[]): Map<string, AttackStats> =>
  mapValues(groupBy(attacks, (a) => a.attackerId), attackStatsOf)

export const attackStatsByType = (attacks: readonly AttackRecord[]): Map<AttackType, AttackStats> =>
  inOrder(mapValues(groupBy(attacks, (a) => a.attackType), attackStatsOf), ATTACK_TYPE_ORDER)

/** 前のサーブレシーブの評価（A〜D）別。切り返しのアタックは入れない */
export const attackStatsByPrevReception = (
  attacks: readonly AttackRecord[],
): Map<Grade, AttackStats> =>
  fixedKeys(attacks, GRADE_ORDER, (a) => a.prevReception, attackStatsOf)

/**
 * バックアタックか。記録画面は種類が「バック」ならバックアタックにするが、どちらか片方だけ付いた記録も
 * バックアタックとして数える（前衛・バックの分け方と、種類別の「バック」で本数が食い違わないように）
 */
export const isBackAttack = (a: AttackRecord): boolean => a.isBack || a.attackType === 'back'

/** 前衛とバックアタック。バックアタック決定率は back の killRate */
export const attackStatsByRow = (
  attacks: readonly AttackRecord[],
): { front: AttackStats; back: AttackStats } => ({
  front: attackStatsOf(attacks.filter((a) => !isBackAttack(a))),
  back: attackStatsOf(attacks.filter(isBackAttack)),
})

// ---- 練習 ----

export interface PracticeStats {
  attempts: number
  /** 入った本数（ミス以外） */
  successes: number
  /** 成功率 = 入った本数 ÷ 本数 × 100 */
  successRate: number | null
  /** 狙ったゾーンに入った本数（ミスは入れない） */
  zoneHits: number
  /** ゾーン的中率 = 狙ったゾーンに入った本数 ÷ 本数 × 100（要件定義書 5 章） */
  zoneHitRate: number | null
}

export function practiceStatsOf(serves: readonly ServeRecord[], zoneOf: ZoneOf): PracticeStats {
  let successes = 0
  let zoneHits = 0
  for (const s of serves) {
    if (s.result === 'miss') continue
    successes++
    if (s.targetZone !== null && zoneOf('opponent', s.toX, s.toY) === s.targetZone) zoneHits++
  }
  return {
    attempts: serves.length,
    successes,
    successRate: percent(successes, serves.length),
    zoneHits,
    zoneHitRate: percent(zoneHits, serves.length),
  }
}

export const practiceStatsByPlayer = (
  serves: readonly ServeRecord[],
  zoneOf: ZoneOf,
): Map<string, PracticeStats> =>
  mapValues(groupBy(serves, (s) => s.serverId), (group) => practiceStatsOf(group, zoneOf))

/** 狙ったゾーン別。狙いを選んでいない記録は入れない */
export const practiceStatsByTargetZone = (
  serves: readonly ServeRecord[],
  zoneOf: ZoneOf,
): Map<number, PracticeStats> =>
  fixedKeys(serves, ZONE_NUMBERS, (s) => s.targetZone, (group) => practiceStatsOf(group, zoneOf))

/**
 * 練習の日ごとの推移（F-11）。keyOfSet に日付などを返す関数を渡す。null のセットは入れない。
 * 練習のサーブは受けた評価がないので、サーブ効果率ではなく成功率・的中率で出す
 */
export function practiceStatsByGroup(
  sets: readonly SetRecords[],
  keyOfSet: (set: SetRecords) => string | null,
  zoneOf: ZoneOf,
): Map<string, PracticeStats> {
  return mapValues(groupBy(sets, keyOfSet), (group) =>
    practiceStatsOf(
      group.flatMap((s) => s.serves),
      zoneOf,
    ),
  )
}

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
 * 相手別・試合別・日ごとの推移になる（練習の日ごとは practiceStatsByGroup）。null を返したセットは入れない
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
