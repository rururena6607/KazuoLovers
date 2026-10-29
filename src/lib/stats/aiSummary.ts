// AI（Gemini）に送る集計の JSON（要件定義書 F-13、「Geminiへの問い合わせ」）。T-31。
// 送るのは背番号と数値だけ。選手の名前・チーム名・学校名・日付は入れない（外部 AI に送る前提）。
// 各値には本数を添え、MIN_SAMPLE 本未満には reference を付ける（本数が少ない項目は断定しないよう AI に指示するため）。
// 率は小数第1位に丸める（外部に出す値で、集計の途中ではない。丸め方は画面の toFixed(1) と同じ）。
// 渡す記録は試合のものだけにする（練習は metrics.ts の前提と同じ理由で混ぜない）。
import {
  MIN_SAMPLE,
  type AttackStats,
  type AttackType,
  type GameSet,
  type Grade,
  type Player,
  type ReceptionStats,
  type ServeStats,
  type ServeType,
  type SetRecords,
} from '../../contracts/index.ts'
import {
  attackStatsByPrevReception,
  attackStatsByType,
  groupBy,
  receptionStatsByOppServeType,
  receptionStatsByZone,
  serveStatsByLandingZone,
  serveStatsByType,
  summaryOf,
  type ZoneOf,
} from './aggregate.ts'
import {
  attackStatsOf,
  breakRateOfStats,
  receptionStatsOf,
  serveStatsOf,
} from './metrics.ts'

export type AiSetInput = Pick<GameSet, 'setNo' | 'ourScore' | 'oppScore'> & {
  /** 何試合目か（1 から）。範囲に複数の試合のセットが入るとき、同じセット番号を区別する。日付は送らない */
  matchNo: number
  records: SetRecords
}

export interface AiSummaryInput {
  /** 背番号に直すためだけに使う。名前は出力に入れない */
  players: readonly Player[]
  sets: readonly AiSetInput[]
}

/** 率は % の数値（小数第1位）。本数 0 は null */
export interface AiServe {
  attempts: number
  efficiency: number | null
  aceRate: number | null
  missRate: number | null
  reference: boolean
}
export interface AiReception {
  receptions: number
  successRate: number | null
  acedRate: number | null
  reference: boolean
}
export interface AiAttack {
  attempts: number
  killRate: number | null
  efficiency: number | null
  errors: number
  reference: boolean
}

/**
 * 選手ごとの行。名前の代わりに背番号を出す。選手の id は出さないので、同じ背番号の別人
 * （引退した選手の番号の再利用）は別の行になり、引退した選手には retired が付く
 */
export type AiPlayerRow<T> = { number: number; retired: boolean } & T

export interface AiSummary {
  /** これより少ない本数は参考値 */
  minSample: number
  sets: ({ matchNo: number; setNo: number; ourScore: number; oppScore: number } & {
    serve: AiServe
    reception: AiReception
    attack: AiAttack
  })[]
  serve: {
    total: AiServe
    byPlayer: AiPlayerRow<AiServe>[]
    /** 名簿にない選手のサーブの本数（total には入っているが byPlayer にはない） */
    unassigned: number
    byType: ({ type: ServeType } & AiServe)[]
    /** 相手コートの着弾ゾーン別。崩し率 =（エース＋C＋D）÷ 本数（要件定義書 5 章）。本数のあるゾーンだけ */
    byLandingZone: { zone: number; attempts: number; breakRate: number; reference: boolean }[]
  }
  reception: {
    total: AiReception
    byPlayer: AiPlayerRow<AiReception>[]
    /** 名簿にない選手のレシーブの本数（相手ミスは数えない） */
    unassigned: number
    /** 自コートの受けた位置別。本数のあるゾーンだけ */
    byZone: ({ zone: number } & AiReception)[]
    byOppServeType: ({ type: ServeType } & AiReception)[]
  }
  attack: {
    total: AiAttack
    byPlayer: AiPlayerRow<AiAttack>[]
    /** 名簿にない選手のアタックの本数 */
    unassigned: number
    byType: ({ type: AttackType } & AiAttack)[]
    byPrevReception: ({ grade: Grade } & AiAttack)[]
  }
}

/** 小数第1位に丸める。符号を外して丸めるので、プラスとマイナスで同じ値になる（画面の toFixed(1) と同じ） */
const round1 = (v: number | null): number | null => {
  if (v === null) return null
  const rounded = Number(Math.abs(v).toFixed(1))
  return v < 0 && rounded !== 0 ? -rounded : rounded
}
const isRef = (count: number): boolean => count < MIN_SAMPLE

const aiServe = (s: ServeStats): AiServe => ({
  attempts: s.attempts,
  efficiency: round1(s.efficiency),
  aceRate: round1(s.aceRate),
  missRate: round1(s.missRate),
  reference: isRef(s.attempts),
})
const aiReception = (s: ReceptionStats): AiReception => ({
  receptions: s.receptions,
  successRate: round1(s.successRate),
  acedRate: round1(s.acedRate),
  reference: isRef(s.receptions),
})
const aiAttack = (s: AttackStats): AiAttack => ({
  attempts: s.attempts,
  killRate: round1(s.killRate),
  efficiency: round1(s.efficiency),
  errors: s.errors,
  reference: isRef(s.attempts),
})

/**
 * 選手ごとの行。名簿にない選手は rows に入れず、その記録の本数を unassigned に数える。
 * playerIdOf が null を返す記録（相手ミスなど、選手がいないもの）は、どちらにも入れない。
 * 並びは背番号順で、同じ背番号なら現役が先
 */
function byRoster<T, V>(
  items: readonly T[],
  playerIdOf: (item: T) => string | null,
  players: readonly Player[],
  toRow: (items: T[]) => V,
): { rows: AiPlayerRow<V>[]; unassigned: number } {
  const playerById = new Map(players.map((p) => [p.id, p]))
  const groups = groupBy(items, playerIdOf)
  const rows: AiPlayerRow<V>[] = []
  let unassigned = 0
  for (const [id, group] of groups) {
    const player = playerById.get(id)
    if (!player) unassigned += group.length
    else rows.push({ number: player.number, retired: !player.active, ...toRow(group) })
  }
  rows.sort((a, b) => a.number - b.number || Number(a.retired) - Number(b.retired))
  return { rows, unassigned }
}

export function buildAiSummary(input: AiSummaryInput, zoneOf: ZoneOf): AiSummary {
  const sets = [...input.sets].sort((a, b) => a.matchNo - b.matchNo || a.setNo - b.setNo)
  const serves = sets.flatMap((s) => s.records.serves)
  const receptions = sets.flatMap((s) => s.records.receptions)
  const attacks = sets.flatMap((s) => s.records.attacks)
  const total = summaryOf({ serves, receptions, attacks })

  const serveRows = byRoster(serves, (s) => s.serverId, input.players, (g) => aiServe(serveStatsOf(g)))
  const receptionRows = byRoster(receptions, (r) => r.receiverId, input.players, (g) =>
    aiReception(receptionStatsOf(g)),
  )
  const attackRows = byRoster(attacks, (a) => a.attackerId, input.players, (g) => aiAttack(attackStatsOf(g)))

  return {
    minSample: MIN_SAMPLE,
    sets: sets.map((s) => {
      const sum = summaryOf(s.records)
      return {
        matchNo: s.matchNo,
        setNo: s.setNo,
        ourScore: s.ourScore,
        oppScore: s.oppScore,
        serve: aiServe(sum.serve),
        reception: aiReception(sum.reception),
        attack: aiAttack(sum.attack),
      }
    }),
    serve: {
      total: aiServe(total.serve),
      byPlayer: serveRows.rows,
      unassigned: serveRows.unassigned,
      byType: [...serveStatsByType(serves)].map(([type, s]) => ({ type, ...aiServe(s) })),
      byLandingZone: [...serveStatsByLandingZone(serves, zoneOf)]
        .filter(([, s]) => s.attempts > 0)
        .map(([zone, s]) => ({
          zone,
          attempts: s.attempts,
          breakRate: round1(breakRateOfStats(s)) ?? 0,
          reference: isRef(s.attempts),
        })),
    },
    reception: {
      total: aiReception(total.reception),
      byPlayer: receptionRows.rows,
      unassigned: receptionRows.unassigned,
      byZone: [...receptionStatsByZone(receptions, zoneOf)]
        .filter(([, s]) => s.receptions > 0)
        .map(([zone, s]) => ({ zone, ...aiReception(s) })),
      byOppServeType: [...receptionStatsByOppServeType(receptions)]
        .filter(([, s]) => s.receptions > 0)
        .map(([type, s]) => ({ type, ...aiReception(s) })),
    },
    attack: {
      total: aiAttack(total.attack),
      byPlayer: attackRows.rows,
      unassigned: attackRows.unassigned,
      byType: [...attackStatsByType(attacks)].map(([type, s]) => ({ type, ...aiAttack(s) })),
      byPrevReception: [...attackStatsByPrevReception(attacks)]
        .filter(([, s]) => s.attempts > 0)
        .map(([grade, s]) => ({ grade, ...aiAttack(s) })),
    },
  }
}
