// AI（Gemini）に送る集計の JSON（要件定義書 F-13、「Geminiへの問い合わせ」）。T-31。
// 送るのは背番号と数値だけ。選手の名前・チーム名・学校名・日付は入れない（外部 AI に送る前提）。
// 各値には本数を添え、MIN_SAMPLE 本未満には reference を付ける（本数が少ない項目は断定しないよう AI に指示するため）。
// 率は小数第1位に丸める（外部に出す値で、集計の途中ではない）。
import {
  MIN_SAMPLE,
  type AttackStats,
  type AttackType,
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
} from './aggregate.ts'
import { attackStatsOf, receptionStatsOf, serveStatsOf } from './metrics.ts'

export interface AiSetInput {
  setNo: number
  ourScore: number
  oppScore: number
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

export interface AiSummary {
  /** これより少ない本数は参考値 */
  minSample: number
  sets: {
    setNo: number
    ourScore: number
    oppScore: number
    serve: AiServe
    reception: AiReception
    attack: AiAttack
  }[]
  serve: {
    total: AiServe
    byPlayer: ({ number: number } & AiServe)[]
    byType: ({ type: ServeType } & AiServe)[]
    /** 相手コートの着弾ゾーン別。C・D率 =（C＋D）÷ 本数。本数のあるゾーンだけ */
    byLandingZone: { zone: number; attempts: number; cdRate: number | null; reference: boolean }[]
  }
  reception: {
    total: AiReception
    byPlayer: ({ number: number } & AiReception)[]
    /** 自コートの受けた位置別。本数のあるゾーンだけ */
    byZone: ({ zone: number } & AiReception)[]
    byOppServeType: ({ type: ServeType } & AiReception)[]
  }
  attack: {
    total: AiAttack
    byPlayer: ({ number: number } & AiAttack)[]
    byType: ({ type: AttackType } & AiAttack)[]
    byPrevReception: ({ grade: Grade } & AiAttack)[]
  }
}

const round1 = (v: number | null): number | null => (v === null ? null : Math.round(v * 10) / 10)
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

/** 背番号ごとに分ける。名簿にない選手は入れない。同じ背番号の選手（引退者の番号の再利用など）は合算する */
function byNumber<T>(
  items: readonly T[],
  playerIdOf: (item: T) => string | null,
  numberOfPlayer: ReadonlyMap<string, number>,
): [number, T[]][] {
  const groups = groupBy(items, (item) => {
    const id = playerIdOf(item)
    return id === null ? null : (numberOfPlayer.get(id) ?? null)
  })
  return [...groups].sort(([a], [b]) => a - b)
}

export function buildAiSummary(input: AiSummaryInput): AiSummary {
  const numberOfPlayer = new Map(input.players.map((p) => [p.id, p.number]))
  const sets = [...input.sets].sort((a, b) => a.setNo - b.setNo)
  const serves = sets.flatMap((s) => s.records.serves)
  const receptions = sets.flatMap((s) => s.records.receptions)
  const attacks = sets.flatMap((s) => s.records.attacks)

  return {
    minSample: MIN_SAMPLE,
    sets: sets.map((s) => ({
      setNo: s.setNo,
      ourScore: s.ourScore,
      oppScore: s.oppScore,
      serve: aiServe(serveStatsOf(s.records.serves)),
      reception: aiReception(receptionStatsOf(s.records.receptions)),
      attack: aiAttack(attackStatsOf(s.records.attacks)),
    })),
    serve: {
      total: aiServe(serveStatsOf(serves)),
      byPlayer: byNumber(serves, (s) => s.serverId, numberOfPlayer).map(([number, group]) => ({
        number,
        ...aiServe(serveStatsOf(group)),
      })),
      byType: [...serveStatsByType(serves)].map(([type, s]) => ({ type, ...aiServe(s) })),
      byLandingZone: [...serveStatsByLandingZone(serves)]
        .filter(([, s]) => s.attempts > 0)
        .map(([zone, s]) => ({
          zone,
          attempts: s.attempts,
          cdRate: round1((s.effects * 100) / s.attempts),
          reference: isRef(s.attempts),
        })),
    },
    reception: {
      total: aiReception(receptionStatsOf(receptions)),
      byPlayer: byNumber(receptions, (r) => r.receiverId, numberOfPlayer).map(([number, group]) => ({
        number,
        ...aiReception(receptionStatsOf(group)),
      })),
      byZone: [...receptionStatsByZone(receptions)]
        .filter(([, s]) => s.receptions > 0)
        .map(([zone, s]) => ({ zone, ...aiReception(s) })),
      byOppServeType: [...receptionStatsByOppServeType(receptions)].map(([type, s]) => ({
        type,
        ...aiReception(s),
      })),
    },
    attack: {
      total: aiAttack(attackStatsOf(attacks)),
      byPlayer: byNumber(attacks, (a) => a.attackerId, numberOfPlayer).map(([number, group]) => ({
        number,
        ...aiAttack(attackStatsOf(group)),
      })),
      byType: [...attackStatsByType(attacks)].map(([type, s]) => ({ type, ...aiAttack(s) })),
      byPrevReception: [...attackStatsByPrevReception(attacks)].map(([grade, s]) => ({
        grade,
        ...aiAttack(s),
      })),
    },
  }
}
